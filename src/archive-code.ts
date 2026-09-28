import { createRollingNumber, createRollingText } from "@kitlangton/rolling-number";

// Numeric IDs retain the original rolling digits; arbitrary suffixes use the
// existing rolling-title animation without coercing letters to NaN.
export function createArchiveCode(host: HTMLElement, animated: boolean) {
  const digits = document.createElement("span"), letters = document.createElement("span");
  host.replaceChildren(digits, letters);
  const number = createRollingNumber(digits, { value: 1, duration: 460, motionBlur: true, animated, locales: "en-US", format: { minimumIntegerDigits: 3, useGrouping: false } });
  const text = createRollingText(letters, { text: "", duration: 460, animated, motionBlur: true, transition: "direct", stagger: "none" });
  type Options = Parameters<typeof number.update>[0] & { id?: string };
  let suffix = "001", numeric = true;
  letters.style.display = "none";
  return {
    update(options: Options) {
      if (options.id !== undefined) suffix = options.id.replace(/^X-/, "");
      const value = Number(suffix);
      const nextNumeric = /^\d+$/.test(suffix) && Number.isSafeInteger(value) && String(value).padStart(3, "0") === suffix;
      const changedMode = numeric !== nextNumeric;
      numeric = nextNumeric;
      digits.style.display = numeric ? "" : "none";
      letters.style.display = numeric ? "none" : "";
      const motion = changedMode ? false : options.animated;
      if (numeric) number.update({ ...options, value, animated: motion });
      else text.update({ text: suffix, animated: motion });
    },
    finish() { number.finish(); text.finish(); },
  };
}
