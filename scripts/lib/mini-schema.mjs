// Minimal JSON Schema (draft-07 subset) validator shared by
// scripts/validate-manifests.mjs and scripts/generate-samples-coverage.mjs.
//
// Zero npm dependencies on purpose: this hand-rolls the small subset of JSON
// Schema keywords this repo's schemas actually use (type, required,
// properties, additionalProperties as either `false` or a sub-schema, items,
// enum, pattern, minLength, minItems, uniqueItems). If a schema grows real
// conditional logic (allOf/oneOf/$ref/etc.) swap this for ajv rather than
// extending the mini-engine below.

/**
 * @param {any} schema
 * @param {any} value
 * @param {string} pathLabel
 * @param {string[]} errors
 */
export function validateAgainstSchema(schema, value, pathLabel, errors) {
  if (schema.type) {
    const actual = jsonType(value);
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.includes(actual)) {
      errors.push(
        `${pathLabel}: expected type ${expected.join(" | ")}, got ${actual}`,
      );
      return; // further checks would be misleading against the wrong type
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(
      `${pathLabel}: value ${JSON.stringify(value)} does not equal const ${JSON.stringify(schema.const)}`,
    );
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(
      `${pathLabel}: value ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`,
    );
  }

  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(
        `${pathLabel}: "${value}" does not match pattern ${schema.pattern}`,
      );
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${pathLabel}: string is shorter than minLength ${schema.minLength}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${pathLabel}: array has fewer than minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = typeof item === "object" ? JSON.stringify(item) : item;
        if (seen.has(key)) {
          errors.push(`${pathLabel}: array items must be unique (duplicate ${JSON.stringify(item)})`);
        }
        seen.add(key);
      }
    }
    if (schema.items) {
      value.forEach((item, i) => {
        validateAgainstSchema(schema.items, item, `${pathLabel}[${i}]`, errors);
      });
    }
  }

  if (schema.type === "object" || (value && typeof value === "object" && !Array.isArray(value) && schema.properties)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const requiredKey of schema.required ?? []) {
        if (!(requiredKey in value)) {
          errors.push(`${pathLabel}: missing required property "${requiredKey}"`);
        }
      }
      const knownProps = new Set(Object.keys(schema.properties ?? {}));
      if (schema.additionalProperties === false && schema.properties) {
        for (const key of Object.keys(value)) {
          if (!knownProps.has(key)) {
            errors.push(`${pathLabel}: unexpected additional property "${key}"`);
          }
        }
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        // Map-style objects: every property not explicitly declared in
        // `properties` is validated against the `additionalProperties`
        // sub-schema (used by samples-coverage.v1.schema.json's
        // capability-key -> sample[] map, whose keys are dynamic).
        for (const key of Object.keys(value)) {
          if (!knownProps.has(key)) {
            validateAgainstSchema(schema.additionalProperties, value[key], `${pathLabel}.${key}`, errors);
          }
        }
      }
      for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
        if (key in value) {
          validateAgainstSchema(subSchema, value[key], `${pathLabel}.${key}`, errors);
        }
      }
    }
  }
}

export function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // "object" | "string" | "number" | "boolean" | "undefined"
}
