function parseStepDataTable(text) {
  const [heading, ...rows] = text.split('\n');
  const columns = toCells(heading);
  return rows.map((row) => toRow(columns, toCells(row)));
}

function toStepDataRows(entries, columns) {
  return entries.map((entry) => toStepDataRow(entry, columns));
}

function toStepDataRow(entry, columns) {
  return columns.reduce((row, column) => Object.assign(row, { [column]: toCell(entry[column]) }), {});
}

function toCells(line) {
  return line.split('|').map((cell) => cell.trim());
}

function toRow(columns, cells) {
  return columns.reduce((row, column, index) => Object.assign(row, { [column]: cells[index] ?? '' }), {});
}

function toCell(value) {
  return value === undefined ? '' : String(value);
}

module.exports = { parseStepDataTable, toStepDataRows };
