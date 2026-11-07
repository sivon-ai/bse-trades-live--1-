// Trade store: append-only, de-duplicated by tradeId, every row gets a sequence number.
// seq == position + 1, so "everything after seq N" is just rows.slice(N). That is what lets a
// dashboard that lost its connection ask for exactly what it missed.
// Persisted to a JSONL file so trades survive a restart. In production this would be a database.
const fs = require('fs');
const path = require('path');

module.exports = class Store {
  constructor(file) {
    this.file = file;
    this.rows = [];
    this.ids = new Set();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        try {
          const t = JSON.parse(line);
          this.ids.add(t.tradeId);
          this.rows.push({ ...t, seq: this.rows.length + 1 });
        } catch { /* blank or half-written line */ }
      }
    }
  }

  get lastSeq() { return this.rows.length; }

  since(seq) { return this.rows.slice(seq); }

  // Idempotent: trades that were already stored are ignored. Returns only the new rows.
  add(trades) {
    const added = [];
    for (const t of trades) {
      if (this.ids.has(t.tradeId)) continue;
      this.ids.add(t.tradeId);
      added.push({ ...t, seq: this.rows.length + added.length + 1 });
    }
    if (added.length) {
      this.rows.push(...added);
      fs.appendFileSync(this.file, added.map(r => JSON.stringify(r)).join('\n') + '\n');
    }
    return added;
  }
};
