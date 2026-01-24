"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function PropertyTypeFilter({
  value,
  options,
}: {
  value: string;
  options: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPropertyType = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    // Preserve runId param when changing property type
    if (newPropertyType && newPropertyType !== "Single Family") {
      params.set("propertyType", newPropertyType);
    } else {
      // Remove propertyType param if default value is selected
      params.delete("propertyType");
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      style={{
        padding: "4px 8px",
        border: "1px solid #ccc",
        borderRadius: 4,
        fontSize: 14,
        marginTop: 4,
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
