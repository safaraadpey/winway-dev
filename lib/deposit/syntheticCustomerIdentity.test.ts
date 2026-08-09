/**
 * Stable synthetic deposit identity tests.
 * Run: node --import tsx --test lib/deposit/syntheticCustomerIdentity.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateStableSyntheticCustomerIdentity,
} from "./syntheticCustomerIdentity";
import {
  normalizeFullName,
  normalizeIranMobile,
  resolveDepositCustomerIdentity,
} from "./customerProfile";

const TEST_SALT = "test-synthetic-salt";
const USER_A = "9f212f11-6549-45ab-9abb-c0ebdfbf0085";
const USER_B = "11111111-1111-1111-1111-111111111111";

describe("generateStableSyntheticCustomerIdentity", () => {
  it("returns the same identity for the same userId", () => {
    const first = generateStableSyntheticCustomerIdentity(USER_A, TEST_SALT);
    const second = generateStableSyntheticCustomerIdentity(USER_A, TEST_SALT);
    assert.deepEqual(first, second);
  });

  it("returns different identities for different userIds", () => {
    const a = generateStableSyntheticCustomerIdentity(USER_A, TEST_SALT);
    const b = generateStableSyntheticCustomerIdentity(USER_B, TEST_SALT);
    assert.notDeepEqual(a, b);
  });

  it("produces valid fullName and Iranian mobile", () => {
    const identity = generateStableSyntheticCustomerIdentity(USER_A, TEST_SALT);
    assert.ok(normalizeFullName(identity.fullName));
    assert.ok(normalizeIranMobile(identity.phone));
    assert.match(identity.phone, /^09\d{9}$/);
  });
});

describe("resolveDepositCustomerIdentity synthetic mode", () => {
  it("ignores client and generates when profile is empty", () => {
    const resolved = resolveDepositCustomerIdentity({
      userId: USER_A,
      syntheticEnabled: true,
      storedFullName: null,
      storedPhone: null,
      clientFullName: "کاربر واقعی",
      clientPhone: "09120000000",
      generateSynthetic: (userId) =>
        generateStableSyntheticCustomerIdentity(userId, TEST_SALT),
    });

    assert.equal(resolved.identityMode, "synthetic");
    assert.equal(resolved.nameSource, "synthetic");
    assert.equal(resolved.phoneSource, "synthetic");
    assert.equal(resolved.needsPersist, true);
    assert.notEqual(resolved.name, "کاربر واقعی");
    assert.notEqual(resolved.phone, "09120000000");
  });

  it("reuses locked profile when present", () => {
    const resolved = resolveDepositCustomerIdentity({
      userId: USER_A,
      syntheticEnabled: true,
      storedFullName: "علی احمدی",
      storedPhone: "09123456789",
      clientFullName: "نام دیگر",
      clientPhone: "09111111111",
      generateSynthetic: (userId) =>
        generateStableSyntheticCustomerIdentity(userId, TEST_SALT),
    });

    assert.equal(resolved.name, "علی احمدی");
    assert.equal(resolved.phone, "09123456789");
    assert.equal(resolved.nameSource, "full_name");
    assert.equal(resolved.phoneSource, "profile");
    assert.equal(resolved.needsPersist, false);
  });
});
