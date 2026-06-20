import codeImg from "@/assets/services/code.png";
import { waLink } from "@/config/site";

// Single source of truth for the "Digital Solutions Development" offering,
// shown on the Home grid, the Services page, and its own detail page.
export const digitalSolutions = {
  id: "digital-solutions-development",
  title: "Digital Solutions Development",
  // Short text shown on the cards.
  oneLiner: "Websites, mobile apps, e-commerce & custom software for your business.",
  // Full text shown on the detail page.
  description:
    "We help businesses establish a strong online presence through modern websites, mobile applications, e-commerce platforms, and custom software solutions. We also provide guidance and development support for academic projects.",
  highlights: [
    "Modern, responsive websites",
    "Mobile applications (Android / iOS)",
    "E-commerce platforms & online stores",
    "Custom software solutions",
    "Guidance & development support for academic projects",
  ],
  href: "/digital-solutions",
  icon: codeImg,
  whatsappLink: waLink(
    "Hi Mahabharat Consultancy, I want to build a website and app for my business. Please share the details."
  ),
};
