/**
 * Safely sync categories + services from catalog.js into MongoDB.
 *
 * - Upserts by category.key / service.slug (no duplicates)
 * - Never deletes existing users, requests, payments, or extra admin-added services
 * - Updates catalog fields (name, description, docs, official links, etc.)
 * - Renames known legacy slugs in place so existing records stay linked
 *
 * Usage:  npm run sync-catalog
 */
const { connectDB, disconnectDB } = require("./config/db");
const { ServiceCategory, Service } = require("./models");
const { categories, services } = require("./data/catalog");

/** Old catalog slugs → new slugs. Applied before upsert to avoid duplicates. */
const SLUG_RENAMES = {
  "pm-cgp": "pmegp",
};

async function migrateRenamedSlugs() {
  let renamed = 0;
  for (const [oldSlug, newSlug] of Object.entries(SLUG_RENAMES)) {
    const oldDoc = await Service.findOne({ slug: oldSlug });
    if (!oldDoc) continue;

    const newDoc = await Service.findOne({ slug: newSlug });
    if (newDoc) {
      // Prefer the correctly slugged record; drop the legacy duplicate.
      await Service.deleteOne({ _id: oldDoc._id });
      console.log(`   Removed legacy duplicate slug "${oldSlug}" (kept "${newSlug}")`);
    } else {
      await Service.updateOne({ _id: oldDoc._id }, { $set: { slug: newSlug } });
      renamed += 1;
      console.log(`   Renamed slug "${oldSlug}" → "${newSlug}"`);
    }
  }
  return renamed;
}

async function syncCatalog() {
  let catsCreated = 0;
  let catsUpdated = 0;
  for (const cat of categories) {
    const existing = await ServiceCategory.findOne({ key: cat.key });
    if (existing) {
      await ServiceCategory.updateOne({ key: cat.key }, { $set: cat });
      catsUpdated += 1;
    } else {
      await ServiceCategory.create(cat);
      catsCreated += 1;
    }
  }

  const renamed = await migrateRenamedSlugs();

  let svcsCreated = 0;
  let svcsUpdated = 0;
  for (const svc of services) {
    const existing = await Service.findOne({ slug: svc.slug });
    if (existing) {
      await Service.updateOne(
        { slug: svc.slug },
        {
          $set: {
            name: svc.name,
            description: svc.description,
            category: svc.category,
            requiredDocuments: svc.requiredDocuments,
            officialLinks: svc.officialLinks,
            priceLabel: svc.priceLabel,
            processingTime: svc.processingTime,
            popular: !!svc.popular,
            isActive: svc.isActive !== false,
          },
        }
      );
      svcsUpdated += 1;
    } else {
      await Service.create(svc);
      svcsCreated += 1;
    }
  }

  // Clean up any leftover user-facing "PM CGP" naming if present under another slug.
  const staleName = await Service.find({ name: /PM\s*CGP/i }).lean();
  for (const doc of staleName) {
    if (doc.slug === "pmegp") continue;
    await Service.updateOne(
      { _id: doc._id },
      {
        $set: {
          name: "PMEGP",
          slug: "pmegp",
          description:
            "Assistance with Prime Minister's Employment Generation Programme (PMEGP) applications for eligible individuals seeking to establish new micro-enterprises and self-employment ventures.",
        },
      }
    ).catch(async () => {
      // Unique slug conflict: deactivate the stale duplicate instead.
      await Service.updateOne({ _id: doc._id }, { $set: { isActive: false, name: "PMEGP (legacy)" } });
    });
  }

  const totalServices = await Service.countDocuments();
  const totalCategories = await ServiceCategory.countDocuments();

  console.log("✅ Catalog sync complete (no wipe)");
  console.log(`   Categories: +${catsCreated} created, ${catsUpdated} updated (${totalCategories} total)`);
  console.log(`   Services:   +${svcsCreated} created, ${svcsUpdated} updated (${totalServices} total)`);
  if (renamed) console.log(`   Slug renames: ${renamed}`);

  const missing = [];
  for (const svc of services) {
    const found = await Service.findOne({ slug: svc.slug }).lean();
    if (!found) missing.push(svc.slug);
  }
  if (missing.length) {
    console.warn("   ⚠ Still missing:", missing.join(", "));
  } else {
    console.log("   All catalog services present in MongoDB");
  }

  const pmegp = await Service.findOne({ slug: "pmegp" }).lean();
  if (pmegp) {
    console.log(`   PMEGP OK: ${pmegp.name} | category=${pmegp.category} | links=${(pmegp.officialLinks || []).map((l) => l.url).join(", ")}`);
  } else {
    console.warn("   ⚠ PMEGP not found after sync");
  }
}

async function run() {
  await connectDB();
  await syncCatalog();
  await disconnectDB();
  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error("Catalog sync failed:", err);
    process.exit(1);
  });
}

module.exports = { syncCatalog };
