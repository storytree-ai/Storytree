import { test } from "node:test";
import assert from "node:assert/strict";
import { toTitleCase } from "./dogfood-probe-mrfuze9m.js";

test("capitalizes the first letter of each word and lowercases the rest", () => {
  assert.equal(toTitleCase("hello world"), "Hello World");
});

test("collapses runs of whitespace between words", () => {
  assert.equal(toTitleCase("hello    world"), "Hello World");
});

test("trims leading and trailing whitespace", () => {
  assert.equal(toTitleCase("  hello world  "), "Hello World");
});

test("lowercases the remainder of an already-uppercase word", () => {
  assert.equal(toTitleCase("HELLO WORLD"), "Hello World");
});

test("handles mixed-case single words", () => {
  assert.equal(toTitleCase("wORLD"), "World");
});

test("returns an empty string for an empty input", () => {
  assert.equal(toTitleCase(""), "");
});

test("returns an empty string for whitespace-only input", () => {
  assert.equal(toTitleCase("   \t\n  "), "");
});

test("handles tabs and newlines as whitespace separators", () => {
  assert.equal(toTitleCase("hello\tworld\nagain"), "Hello World Again");
});

test("never throws for arbitrary string input", () => {
  assert.doesNotThrow(() => toTitleCase("!@# 123 mIxEd-case_str"));
  assert.equal(toTitleCase("!@# 123 mIxEd-case_str"), "!@# 123 Mixed-case_str");
});
