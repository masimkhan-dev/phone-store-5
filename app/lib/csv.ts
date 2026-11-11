/** RFC 4180 CSV. Cells starting with = + - @ are prefixed so spreadsheets do not run them as formulas. */
export function toCsv(rows: (string | number | null)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let text = cell === null ? "" : String(cell);
          if (typeof cell === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
          return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\r\n");
}
