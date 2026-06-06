import dotenv from "dotenv";

import { connectDB } from "../src/config/db.js";
import { ensureAdminAccount } from "../src/utils/ensureAdminAccount.js";

dotenv.config();

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to seed an admin");
  }

  await connectDB();
  await ensureAdminAccount();
  console.log(`Admin ensured for ${email.toLowerCase().trim()}`);
  process.exit(0);
}

seedAdmin().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
