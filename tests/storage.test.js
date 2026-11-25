"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../web/js/storage.js"), "utf8");

function makeStore(localStorage) {
  const window = { localStorage, addEventListener() {} };
  const context = vm.createContext({ window });
  vm.runInContext(source, context, { filename: "web/js/storage.js" });
  return window.MCPAStorage;
}

function blockedStorage() {
  return {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("storage blocked"); },
    removeItem() { throw new Error("storage blocked"); },
  };
}

function workingStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("memory fallback warns that a transaction will not survive leaving the page", () => {
  const store = makeStore(blockedStorage());
  const txn = { id: "SIM-STR-20261125-ABC123", sourceAmount: 100, status: "SUCCESS" };

  const result = store.addTransaction(txn);

  assert.equal(result.ok, true);
  assert.match(result.warning, /only in memory on this page/i);
  assert.match(result.warning, /lost if you leave or reload/i);
  assert.equal(store.loadTransactions().data[0].id, txn.id);
});

test("persistent storage does not return a memory-fallback warning", () => {
  const store = makeStore(workingStorage());
  const txn = { id: "SIM-RZP-20261125-DEF456", sourceAmount: 50, status: "FAILED" };

  const result = store.addTransaction(txn);

  assert.equal(result.ok, true);
  assert.equal(result.warning, undefined);
  assert.equal(store.loadTransactions().data[0].id, txn.id);
});
