import { describe, expect, it } from "vitest";
import { developerWhatsAppLink } from "@/config/developer";

describe("developer WhatsApp link (fixed in code)", () => {
  it("opens wa.me with the prepared message, encoded", () => {
    const url = developerWhatsAppLink({ whatsapp: "252612345678", message: "Salaam Darwiish, OrbitCargo & system?" });
    expect(url).toBe("https://wa.me/252612345678?text=Salaam%20Darwiish%2C%20OrbitCargo%20%26%20system%3F");
  });

  it("gives no link for an empty or malformed number", () => {
    for (const whatsapp of ["", "+252612345678", "0612345678", "25261abc", "javascript:alert(1)"]) {
      expect(developerWhatsAppLink({ whatsapp, message: "x" })).toBeNull();
    }
  });
});
