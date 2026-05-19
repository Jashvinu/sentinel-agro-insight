import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const SPREADSHEET_ID = "1fBcF0aSwT0m0YKb12DsNos8Ou_jrRLO0PWpVU048Lqg";
const SHEET_NAME = "FarmerSurveys_updated";

const COLUMNS = [
  "id",
  "survey_date",
  "season",
  "farmer_name",
  "gender",
  "date_of_birth",
  "category",
  "education_level",
  "village_gp",
  "block",
  "district",
  "fpc_name",
  "aadhar_no",
  "mobile_no",
  "land_owned",
  "land_leased",
  "total_rainfed_land",
  "total_irrigated_land",
  "land_under_millet",
  "land_under_other_crops",
  "cropping_intensity",
  "major_crops_grown",
  "millet_seed_type",
  "millet_seed_variety",
  "seed_used_kg_per_acre",
  "fertilizer_used_kg_per_acre",
  "pesticide_used_litres_per_acre",
  "use_bio_fertilizer",
  "access_to_credit",
  "access_to_extension_services",
  "mechanization_access",
  "millet_productivity",
  "other_crops_productivity",
  "total_millet_production",
  "quantity_millet_sold",
  "quantity_home_consumption",
  "quantity_used_as_seed",
  "avg_millet_selling_price",
  "post_harvest_practices",
  "where_produce_sold",
  "training_received",
  "training_source",
  "avg_cost_cultivation_millets",
  "net_income_millets",
  "avg_cost_cultivation_other",
  "net_income_other_crops",
  "sources_of_income",
  "annual_agri_income",
  "annual_non_agri_income",
  "total_annual_income",
  "created_at",
  "updated_at",
];

// Base64url encode
function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlFromString(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

// Import RSA private key for signing
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Create a signed JWT and exchange for Google access token
async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = Deno.env.get("GOOGLE_CLIENT_EMAIL")!;
  const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY")!.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64urlFromString(JSON.stringify(header));
  const encodedPayload = base64urlFromString(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64url(new Uint8Array(signature))}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// Clear sheet and write all data
async function writeToSheet(
  accessToken: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  const sheetsBaseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
  const range = `${SHEET_NAME}!A1`;

  // Build values array: header row + data rows
  const values = [
    COLUMNS, // header
    ...rows.map((row) =>
      COLUMNS.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return "";
        return String(val);
      })
    ),
  ];

  // Clear existing data
  await fetch(`${sheetsBaseUrl}/values/${SHEET_NAME}!A:AZ:clear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Write all data
  const writeResponse = await fetch(
    `${sheetsBaseUrl}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ range, majorDimension: "ROWS", values }),
    }
  );

  if (!writeResponse.ok) {
    const err = await writeResponse.text();
    throw new Error(`Google Sheets API error: ${err}`);
  }
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Initialize Supabase client with service role key for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all farmer surveys
    const { data: surveys, error } = await supabase
      .from("farmer_surveys")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    // Get Google access token
    const accessToken = await getGoogleAccessToken();

    // Write to Google Sheet
    await writeToSheet(accessToken, surveys || []);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${surveys?.length ?? 0} rows to Google Sheets`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
