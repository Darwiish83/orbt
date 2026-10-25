import { describe, expect, it } from "vitest";
import { amountInWords, integerInWords } from "@/modules/finance/words";

describe("amount in words (receipts)", () => {
  it("reads whole numbers", () => {
    expect(integerInWords(0)).toBe("zero");
    expect(integerInWords(15)).toBe("fifteen");
    expect(integerInWords(85)).toBe("eighty-five");
    expect(integerInWords(100)).toBe("one hundred");
    expect(integerInWords(49750)).toBe("forty-nine thousand seven hundred fifty");
    expect(integerInWords(2_000_015)).toBe("two million fifteen");
  });

  it("reads an amount with its currency and cents", () => {
    expect(amountInWords("1000", "USD")).toBe("One thousand US dollars only");
    expect(amountInWords("985.5", "USD")).toBe("Nine hundred eighty-five US dollars and fifty cents only");
    expect(amountInWords("1.01", "EUR")).toBe("One euro and one cent only");
    expect(() => amountInWords("-3")).toThrow();
  });
});
