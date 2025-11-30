// utils/csv_parser.js
export function parseCSV(csvText) {
    // BOM 제거
    if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.slice(1);
    }

    // 줄 단위 분리
    const lines = csvText
        .replace(/\r/g, "")
        .split("\n")
        .filter(line => line.trim() !== "");

    if (lines.length < 2) return { header: [], rows: [] };

    // 구분자 자동 감지 ( , 또는 ; )
    const firstLine = lines[0];
    const delimiter = firstLine.includes(";") ? ";" : ",";

    // CSV 한 줄 파싱 함수
    const parseLine = (line) => {
        const result = [];
        let current = "";
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const next = line[i + 1];

            if (char === '"' && !insideQuotes) {
                insideQuotes = true;
                continue;
            }

            if (char === '"' && insideQuotes && next === '"') {
                current += '"';
                i++;
                continue;
            }

            if (char === '"' && insideQuotes) {
                insideQuotes = false;
                continue;
            }

            if (char === delimiter && !insideQuotes) {
                result.push(current.trim());
                current = "";
                continue;
            }

            current += char;
        }

        result.push(current.trim());
        return result;
    };

    const header = parseLine(lines[0]).map(h => h.trim());
    const rows = lines.slice(1).map(line => parseLine(line));

    return { header, rows };
}
