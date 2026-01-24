import React from "react";
import { supabaseAdmin } from "@/lib/supabase";
import ScrapeForm from "./components/ScrapeForm";
import RunStatus from "./components/RunStatus";
import PropertySearchForm from "./components/PropertySearchForm";

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}/${day}/${year}`;
  } catch {
    return "-";
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "";
  const parts = Math.abs(amount).toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = parts.join(".");
  return `$${amount < 0 ? "-" : ""}${formatted}`;
}

function normalizePropertyType(type: string | null | undefined): string {
  if (!type) return "Unknown";
  const normalized = type.toUpperCase().replace(/_/g, " ");
  // Convert "SINGLE FAMILY" to "Single Family", etc.
  return normalized
    .split(" ")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function matchesPropertyType(
  listingType: string | null | undefined,
  filterType: string
): boolean {
  if (filterType === "All") return true;
  const normalizedListing = normalizePropertyType(listingType);
  const normalizedFilter = normalizePropertyType(filterType);
  return normalizedListing === normalizedFilter;
}

function isWithinSqftRange(
  listingSqft: number | null | undefined,
  compSqft: number | null | undefined,
  percentage: number
): boolean {
  // If listing has no sqft, include all comps (don't filter)
  if (listingSqft == null || listingSqft === 0) {
    return true;
  }
  
  // If comp has no sqft, exclude it when filter is active
  if (compSqft == null || compSqft === 0) {
    return false;
  }
  
  // Calculate range: [listingSqft * (1 - percentage/100), listingSqft * (1 + percentage/100)]
  const minSqft = listingSqft * (1 - percentage / 100);
  const maxSqft = listingSqft * (1 + percentage / 100);
  
  return compSqft >= minSqft && compSqft <= maxSqft;
}

type MatchedResult = {
  listing: {
    zpid?: string | null;
    url: string;
    address?: string | null;
    zipcode?: string | null;
    city?: string | null;
    state?: string | null;
    price?: number | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    home_type?: string | null;
    architectural_style?: string | null;
  };
  comps: Array<{
    url: string;
    sold_price?: number | null;
    sold_date?: string | null;
    distance_miles?: number | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    address?: string | null;
    home_type?: string | null;
    architectural_style?: string | null;
  }>;
  comp_search_window: "3mo" | "6mo";
};

type Run = {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  zip_codes: string[];
  created_at: string;
};

async function getRuns(): Promise<Run[]> {
  try {
    if (!supabaseAdmin) {
      console.error("Supabase admin client not available");
      return [];
    }
    const { data, error } = await supabaseAdmin
      .from("runs")
      .select("run_id, status, zip_codes, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to fetch runs:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error fetching runs:", error);
    return [];
  }
}

async function getAvailablePropertyTypes(): Promise<string[]> {
  try {
    if (!supabaseAdmin) {
      console.error("Supabase admin client not available");
      return ["Single Family"];
    }
    
    // Get all unique home_type values from listings table
    const { data, error } = await supabaseAdmin
      .from("listings")
      .select("home_type");

    if (error) {
      console.error("Failed to fetch property types:", error);
      return ["Single Family"];
    }

    // Extract unique property types and normalize them
    const propertyTypesSet = new Set<string>();
    (data || []).forEach((listing) => {
      const normalized = normalizePropertyType(listing.home_type);
      if (normalized !== "Unknown") {
        propertyTypesSet.add(normalized);
      }
    });

    // Always include "Single Family" as default
    propertyTypesSet.add("Single Family");
    
    return Array.from(propertyTypesSet).sort();
  } catch (error) {
    console.error("Error fetching property types:", error);
    return ["Single Family"];
  }
}

async function getMatchedResults(runId: string): Promise<MatchedResult[]> {
  try {
    if (!supabaseAdmin) {
      console.error("[ERROR] Supabase admin client not available - check SUPABASE_SERVICE_ROLE_KEY env var");
      return [];
    }
    
    console.log(`[DEBUG] Using Supabase admin client for run ${runId}`);
    
    // Get the run UUID first
    const { data: runData, error: runError } = await supabaseAdmin.from("runs").select("id").eq("run_id", runId).single();
    if (runError || !runData) {
      console.error("Failed to fetch run:", runError);
      return [];
    }

    console.log(`[DEBUG] Fetching listings for run ${runId} (UUID: ${runData.id})`);

    // Get all listings for this run
    const { data: listings, error: listingsError } = await supabaseAdmin
      .from("listings")
      .select("*")
      .eq("run_id", runData.id);

    if (listingsError) {
      console.error("Failed to fetch listings:", listingsError);
      return [];
    }

    if (!listings || listings.length === 0) {
      console.log(`No listings found for run ${runId}`);
      return [];
    }

    console.log(`Found ${listings.length} listings for run ${runId}`);

    // Batch fetch all comps for all listings in a single query
    const listingIds = listings.map((l) => l.id);
    console.log(`[DEBUG] Fetching comps for ${listingIds.length} listings in batch...`);
    
    const { data: allComps, error: compsError } = await supabaseAdmin
      .from("sold_comps")
      .select("*")
      .in("listing_id", listingIds);

    if (compsError) {
      console.error(`[ERROR] Failed to fetch comps:`, compsError);
      return [];
    }

    // Group comps by listing_id
    const compsByListingId = new Map<string, typeof allComps>();
    (allComps || []).forEach((comp) => {
      const listingId = comp.listing_id;
      if (!compsByListingId.has(listingId)) {
        compsByListingId.set(listingId, []);
      }
      compsByListingId.get(listingId)!.push(comp);
    });

    console.log(`[DEBUG] Found comps for ${compsByListingId.size} listings`);

    const results: MatchedResult[] = [];
    let listingsWithComps = 0;
    let listingsWithoutComps = 0;

    for (const listing of listings) {
      const comps = compsByListingId.get(listing.id) || [];

      // Only include listings that have comps (matched results)
      if (comps.length === 0) {
        listingsWithoutComps++;
        if (listingsWithoutComps <= 3) {
          console.log(`[DEBUG] Listing ${listing.id} (${listing.address}) has no comps, skipping`);
        }
        continue;
      }

      listingsWithComps++;
      if (listingsWithComps <= 3) {
        console.log(`[DEBUG] Listing ${listing.id} (${listing.address}) has ${comps.length} comps`);
      }

      // Get comp_search_window from first comp (they should all be the same)
      const compSearchWindow = comps[0]?.comp_search_window || "3mo";

      try {
        results.push({
        listing: {
          zpid: listing.zpid,
          url: listing.url,
          address: listing.address,
          zipcode: listing.zipcode,
          city: listing.city,
          state: listing.state,
          price: listing.price,
          beds: listing.beds,
          baths: listing.baths,
          sqft: listing.sqft,
          home_type: listing.home_type,
          architectural_style: listing.architectural_style,
        },
        comps: comps.map((comp) => ({
          url: comp.url,
          sold_price: comp.sold_price,
          sold_date: comp.sold_date,
          distance_miles: comp.distance_miles,
          beds: comp.beds,
          baths: comp.baths,
          sqft: comp.sqft,
          address: comp.address,
          home_type: comp.home_type,
          architectural_style: comp.architectural_style,
        })),
        comp_search_window: compSearchWindow as "3mo" | "6mo",
        });
      } catch (pushError: any) {
        console.error(`[ERROR] Failed to push result for listing ${listing.id}:`, pushError);
        console.error(`[ERROR] Listing data:`, JSON.stringify(listing, null, 2));
        console.error(`[ERROR] Comps data (first 2):`, JSON.stringify(comps?.slice(0, 2), null, 2));
      }
    }

    console.log(`[DEBUG] Summary: ${listingsWithComps} listings with comps, ${listingsWithoutComps} listings without comps`);
    console.log(`Returning ${results.length} matched results (listings with comps)`);
    return results;
  } catch (error) {
    console.error("Error fetching matched results:", error);
    return [];
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string; propertyType?: string; sqftPercentage?: string }>;
}) {
  const params = await searchParams;
  const runs = await getRuns();
  const propertyTypes = await getAvailablePropertyTypes();
  
  console.log(`Found ${runs.length} runs`);
  console.log(`Found ${propertyTypes.length} property types: ${propertyTypes.join(", ")}`);

  // Only fetch and display results if both runId and propertyType are provided
  const hasSearchParams = params.runId && params.propertyType;
  
  // Parse sqft percentage (default: 20)
  const sqftPercentage = params.sqftPercentage 
    ? parseFloat(params.sqftPercentage) 
    : 20;
  
  // Validate percentage is between 0-100
  const validSqftPercentage = isNaN(sqftPercentage) || sqftPercentage < 0 || sqftPercentage > 100
    ? 20
    : sqftPercentage;
  
  let activeRun: Run | undefined;
  let matched: MatchedResult[] = [];
  let filteredMatched: MatchedResult[] = [];
  
  if (hasSearchParams) {
    // Find the selected run
    activeRun = runs.find((r) => r.run_id === params.runId);
    
    if (activeRun) {
      console.log(`Active run: ${activeRun.run_id} (status: ${activeRun.status})`);
      matched = await getMatchedResults(activeRun.run_id);
      console.log(`Found ${matched.length} matched results for display`);

      // Filter listings by property type
      const selectedPropertyType = params.propertyType!;
      const filteredListings = matched.filter((result) =>
        matchesPropertyType(result.listing.home_type, selectedPropertyType)
      );

      // Filter comps by property type first
      const compsFilteredByType = filteredListings.map((result) => ({
        ...result,
        comps: result.comps.filter((comp) =>
          matchesPropertyType(comp.home_type, selectedPropertyType)
        ),
      }));

      // Then filter comps by sqft range
      filteredMatched = compsFilteredByType.map((result) => ({
        ...result,
        comps: result.comps.filter((comp) =>
          isWithinSqftRange(result.listing.sqft, comp.sqft, validSqftPercentage)
        ),
      })).filter((result) => result.comps.length > 0); // Only keep listings that have matching comps

      console.log(
        `Filtered to ${filteredMatched.length} results (listings and comps) for property type: ${selectedPropertyType}, sqft tolerance: ±${validSqftPercentage}%`
      );
    }
  }

  // Find any running or pending runs
  const activeStatusRun = runs.find((r) => r.status === "pending" || r.status === "running");

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>Zillow scrapper</h1>
      <p style={{ marginTop: 0, color: "#666" }}>
        Matched listings (for-sale with sold comps within 1 mile).
      </p>

      <ScrapeForm />

      {activeStatusRun && <RunStatus runId={activeStatusRun.run_id} />}

      {!hasSearchParams ? (
        // Show search form when no search params
        <div style={{ marginTop: 24 }}>
          <PropertySearchForm
            runs={runs}
            propertyTypes={propertyTypes}
            defaultPropertyType="Single Family"
            defaultSqftPercentage="20"
          />
        </div>
      ) : (
        // Show results when search params are present
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, marginTop: 24 }}>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Run</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {activeRun?.run_id || params.runId} ({activeRun?.status || "unknown"})
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Property Type</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{params.propertyType}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Sqft Tolerance</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>±{validSqftPercentage}%</div>
            </div>
            {activeRun && (
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
                ZIPs: {activeRun.zip_codes.join(", ")}
              </div>
            )}
            <div style={{ marginLeft: "auto" }}>
              <a
                href="/"
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#f0f0f0",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  fontSize: 14,
                  cursor: "pointer",
                  textDecoration: "none",
                  color: "inherit",
                  display: "inline-block",
                }}
              >
                New Search
              </a>
            </div>
          </div>

      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>
                Address
              </th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>ZIP</th>
              <th style={{ textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }}>
                Price
              </th>
              <th style={{ textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }}>
                Beds
              </th>
              <th style={{ textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }}>
                Baths
              </th>
              <th style={{ textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }}>
                Sqft
              </th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>
                Style
              </th>
              <th style={{ textAlign: "right", padding: 12, borderBottom: "1px solid #eee" }}>
                Comps
              </th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>
                Window
              </th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #eee" }}>
                Links
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredMatched.length === 0 ? (
              <tr>
                <td style={{ padding: 12 }} colSpan={10}>
                  {activeRun
                    ? `No matched results for run "${params.runId}" and property type "${params.propertyType}".`
                    : "Run not found or no data available."}
                </td>
              </tr>
            ) : (
              filteredMatched.map((row) => (
                <React.Fragment key={row.listing.zpid ?? row.listing.url}>
                  <tr>
                    <td style={{ padding: 12, borderBottom: "1px solid #f1f1f1" }}>
                      {row.listing.address ?? row.listing.city ?? row.listing.url}
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f1f1f1" }}>
                      {row.listing.zipcode ?? ""}
                    </td>
                    <td
                      style={{
                        padding: 12,
                        borderBottom: "1px solid #f1f1f1",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatCurrency(row.listing.price)}
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f1f1f1", textAlign: "right" }}>
                      {row.listing.beds ?? ""}
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f1f1f1", textAlign: "right" }}>
                      {row.listing.baths ?? ""}
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f1f1f1", textAlign: "right" }}>
                      {row.listing.sqft != null && row.listing.sqft > 0 
                        ? row.listing.sqft.toLocaleString() 
                        : "-"}
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f1f1f1" }}>
                      {row.listing.architectural_style ?? "-"}
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f1f1f1", textAlign: "right" }}>
                      {row.comps.length}
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f1f1f1" }}>
                      {row.comp_search_window}
                    </td>
                    <td style={{ padding: 12, borderBottom: "1px solid #f1f1f1" }}>
                      <a href={row.listing.url} target="_blank" rel="noreferrer">
                        Listing
                      </a>
                    </td>
                  </tr>
                  {row.comps.length > 0 && (
                    <tr key={`${row.listing.zpid ?? row.listing.url}-comps`}>
                      <td colSpan={10} style={{ padding: 0, borderBottom: "1px solid #e0e0e0" }}>
                        <div style={{ padding: "16px 24px", background: "#fafafa" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#333" }}>
                            Sold Comps ({row.comps.length} found):
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead>
                                <tr style={{ background: "#f5f5f5" }}>
                                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 600 }}>
                                    Address
                                  </th>
                                  <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 600 }}>
                                    Sold Price
                                  </th>
                                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 600 }}>
                                    Sold Date
                                  </th>
                                  <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 600 }}>
                                    Beds
                                  </th>
                                  <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 600 }}>
                                    Baths
                                  </th>
                                  <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 600 }}>
                                    Sqft
                                  </th>
                                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 600 }}>
                                    Style
                                  </th>
                                  <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 600 }}>
                                    Distance
                                  </th>
                                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 12, fontWeight: 600 }}>
                                    Link
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.comps.map((comp, idx) => (
                                  <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee" }}>
                                      {comp.address ?? comp.url}
                                    </td>
                                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "right", whiteSpace: "nowrap" }}>
                                      {comp.sold_price ? formatCurrency(comp.sold_price) : "-"}
                                    </td>
                                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee" }}>
                                      {formatDate(comp.sold_date)}
                                    </td>
                                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "right" }}>
                                      {comp.beds ?? "-"}
                                    </td>
                                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "right" }}>
                                      {comp.baths ?? "-"}
                                    </td>
                                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "right" }}>
                                      {comp.sqft != null && comp.sqft > 0 
                                        ? comp.sqft.toLocaleString() 
                                        : "-"}
                                    </td>
                                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee" }}>
                                      {comp.architectural_style ?? "-"}
                                    </td>
                                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "right" }}>
                                      {comp.distance_miles ? `${comp.distance_miles.toFixed(2)} mi` : "-"}
                                    </td>
                                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee" }}>
                                      <a href={comp.url} target="_blank" rel="noreferrer" style={{ color: "#0066cc", textDecoration: "none" }}>
                                        View
                                      </a>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
    </main>
  );
}
