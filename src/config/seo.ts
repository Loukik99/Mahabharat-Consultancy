import { site } from "@/config/site";
import { serviceCatalog } from "@/data/catalog";

/** Canonical production origin — never localhost. */
export const SITE_URL = "https://mahabharat.net.in";

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpeg`;

export type PageSeo = {
  title: string;
  description: string;
  path: string;
  /** When true, emits robots noindex,nofollow */
  noindex?: boolean;
  ogType?: "website" | "article";
  image?: string;
};

/** Absolute URL for a path (leading slash, no trailing slash except home). */
export function canonicalUrl(path: string): string {
  if (!path || path === "/") return `${SITE_URL}/`;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${clean.replace(/\/+$/, "")}`;
}

export const pageSeo = {
  home: {
    title: "Mahabharat Consultancy | Government & Online Services in Belagavi",
    description:
      "Mahabharat Consultancy helps with Aadhaar, PAN, EPFO, GST, ITR, exam forms, printing, and bill payments in Belagavi. Visit us on G.I.T College Road, Udyambag.",
    path: "/",
  },
  services: {
    title: "Services | Mahabharat Consultancy",
    description:
      "Browse government documents, tax & GST, exams & jobs, business registration, printing, and bill payment services at Mahabharat Consultancy, Belagavi.",
    path: "/services",
  },
  digitalSolutions: {
    title: "Digital Solutions Development | Mahabharat Consultancy",
    description:
      "Websites, mobile apps, e-commerce platforms, and custom software development support from Mahabharat Consultancy in Belagavi.",
    path: "/digital-solutions",
  },
  jobs: {
    title: "Government Jobs | Mahabharat Consultancy",
    description:
      "Browse government job openings and get help filling applications for Army, Navy, Air Force, railways, banking, and other exams in Belagavi.",
    path: "/jobs",
  },
  login: {
    title: "Customer Login | Mahabharat Consultancy",
    description: "Sign in to your Mahabharat Consultancy customer account to track service requests.",
    path: "/login",
    noindex: true,
  },
  signup: {
    title: "Create Account | Mahabharat Consultancy",
    description: "Create a Mahabharat Consultancy customer account to submit and track service requests.",
    path: "/signup",
    noindex: true,
  },
  staff: {
    title: "Staff Login | Mahabharat Consultancy",
    description: "Staff and admin sign-in for Mahabharat Consultancy.",
    path: "/staff",
    noindex: true,
  },
  notFound: {
    title: "Page Not Found | Mahabharat Consultancy",
    description: "The page you requested could not be found.",
    path: "/",
    noindex: true,
  },
  dashboard: {
    title: "Dashboard | Mahabharat Consultancy",
    description: "Manage your Mahabharat Consultancy service requests.",
    path: "/dashboard",
    noindex: true,
  },
  newRequest: {
    title: "New Request | Mahabharat Consultancy",
    description: "Submit a new service request.",
    path: "/new-request",
    noindex: true,
  },
  requestDetail: {
    title: "Request Details | Mahabharat Consultancy",
    description: "View your service request details.",
    path: "/requests",
    noindex: true,
  },
  agent: {
    title: "Agent Dashboard | Mahabharat Consultancy",
    description: "Agent workspace.",
    path: "/agent",
    noindex: true,
  },
  admin: {
    title: "Admin | Mahabharat Consultancy",
    description: "Admin workspace.",
    path: "/admin",
    noindex: true,
  },
} as const satisfies Record<string, PageSeo>;

/** Build service detail SEO from catalog/API service fields. */
export function servicePageSeo(service: {
  name: string;
  description: string;
  slug?: string;
  id: string;
}): PageSeo {
  const slug = service.slug || service.id;
  const shortName = service.name.replace(/\s+Assistance$/i, "").trim();
  return {
    title: `${shortName} | Mahabharat Consultancy`,
    description:
      service.description.length > 155
        ? `${service.description.slice(0, 152).trim()}…`
        : service.description,
    path: `/services/${slug}`,
  };
}

/** Static public paths included in sitemap (excludes auth/admin and filtered views). */
export function indexableStaticPaths(): string[] {
  return ["/", "/services", "/digital-solutions", "/jobs"];
}

export function indexableServicePaths(): string[] {
  return serviceCatalog
    .filter((s) => s.isActive !== false)
    .map((s) => `/services/${s.slug || s.id}`);
}

/** Organization / LocalBusiness JSON-LD (facts from site config only). */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "ProfessionalService"],
    "@id": `${SITE_URL}/#organization`,
    name: site.name,
    description: site.tagline,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo.png`,
    image: DEFAULT_OG_IMAGE,
    telephone: site.phone,
    email: site.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: "G.I.T College Road, Udyambag",
      addressLocality: "Belagavi",
      addressRegion: "Karnataka",
      postalCode: "590008",
      addressCountry: "IN",
    },
    geo: undefined,
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        opens: "09:00",
        closes: "20:00",
      },
    ],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: site.name,
    url: `${SITE_URL}/`,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-IN",
  };
}

export function webPageJsonLd(opts: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonicalUrl(opts.path)}#webpage`,
    url: canonicalUrl(opts.path),
    name: opts.title,
    description: opts.description,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-IN",
  };
}

export function serviceJsonLd(opts: {
  name: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: opts.name,
    description: opts.description,
    url: canonicalUrl(opts.path),
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: {
      "@type": "City",
      name: "Belagavi",
    },
  };
}

export function breadcrumbJsonLd(
  items: { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}
