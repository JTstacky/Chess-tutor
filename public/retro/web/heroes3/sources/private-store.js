// The Worker enforces full-account access to the private game files.
import { PRIVATE_STORE } from "../config.js";
import { Sha256 } from "../sha256.js";
import {
  planImport,
  safeGamePath,
  writeEntriesToOpfs,
} from "../data-import.js";

function session() {
  try {
    return localStorage.getItem("evonline.session");
  } catch {
    return null;
  }
}
function profileKind() {
  try {
    return localStorage.getItem("tenggames.kind");
  } catch {
    return null;
  }
}
function isGuest() {
  try {
    return profileKind() === "guest" || localStorage.getItem("evonline.tier") === "guest";
  } catch {
    return true;
  }
}
const endpoint =
  PRIVATE_STORE.apiBase.replace(/\/$/, "") + "/api/private/heroes3/";
async function failStatus(response) {
  if (response.status === 403) {
    const body = (await response.text()).slice(0, 1000);
    let message = body;
    try {
      const parsed = JSON.parse(body);
      message = parsed.message ?? parsed.error ?? "";
    } catch {}
    throw Error(typeof message === "string" && message.trim() ? message.trim().slice(0, 400) : "Access denied by the private store.");
  }
  if (response.status === 401) throw Error("Sign in on Teng Games first.");
  if (response.status === 404) throw Error("The private store is not set up yet.");
  throw Error(`Private store returned ${response.status}.`);
}
async function get(path, token) {
  let response;
  try {
    response = await fetch(endpoint + path, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "omit",
      mode: "cors",
    });
  } catch {
    throw Error("The private store is not set up yet.");
  }
  const cacheControl = response.headers.get("Cache-Control") ?? "";
  if (
    !/\bprivate\b/i.test(cacheControl) ||
    !/\bno-store\b/i.test(cacheControl)
  ) {
    throw Error("The private store response is missing no-store protection.");
  }
  if (!response.ok) await failStatus(response);
  return response;
}
export const privateStoreSource = {
  id: "private-store",
  label: "Load my files",
  isAvailable() {
    // This is a UI hint; the Worker decides which profiles have full access.
    return !!(
      PRIVATE_STORE.enabled &&
      session() &&
      !isGuest()
    );
  },
  async load({ onProgress } = {}) {
    const token = session();
    if (!this.isAvailable() || !token)
      throw Error("Sign in with a profile to load your files.");
    const manifest = await (await get("manifest", token)).json();
    if (!Array.isArray(manifest.files))
      throw Error("Invalid private store manifest.");
    const entries = manifest.files.map((f) => {
      if (
        !safeGamePath(f.path) ||
        !Number.isSafeInteger(Number(f.size)) ||
        Number(f.size) < 0 ||
        !/^[0-9a-f]{64}$/i.test(f.sha256)
      )
        throw Error("Invalid private store file record.");
      return {
        name: f.path,
        size: Number(f.size),
        stream() {
          let reader;
          const hash = new Sha256();
          return new ReadableStream({
            async pull(controller) {
              try {
                if (!reader) {
                  const response = await get(
                    f.path.split("/").map(encodeURIComponent).join("/"),
                    token,
                  );
                  const headerHash = response.headers.get("X-Sha256");
                  if (!/^[0-9a-f]{64}$/i.test(headerHash ?? "") || headerHash.toLowerCase() !== f.sha256.toLowerCase())
                    throw Error(`Private store checksum header mismatch: ${f.path}`);
                  if (!response.body)
                    throw Error(
                      "The private store did not send a file stream.",
                    );
                  reader = response.body.getReader();
                }
                const { done, value } = await reader.read();
                if (done) {
                  if (hash.hex() !== f.sha256.toLowerCase())
                    throw Error(`Private store SHA-256 mismatch: ${f.path}`);
                  controller.close();
                } else {
                  hash.update(value);
                  controller.enqueue(value);
                }
              } catch (error) {
                controller.error(error);
              }
            },
            cancel() {
              reader?.cancel();
            },
          });
        },
      };
    });
    const checked = planImport(entries);
    if (checked.skippedNames.length || checked.plan.length !== entries.length)
      throw Error("Invalid private store manifest entries.");
    if (checked.missingRequired.length)
      throw Error(
        `Missing required files: ${checked.missingRequired.join(", ")}`,
      );
    return writeEntriesToOpfs(checked.plan, {
      source: "private-store",
      onProgress,
    });
  },
};
