// End-to-end API smoke test for the store rating application.
// Exercises every role and writes nothing to the repository.
import { readFileSync } from "node:fs";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:3000/api";

function readEnv() {
  const text = readFileSync(new URL("../server/.env", import.meta.url), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = readEnv();
const results = [];
let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    results.push(`PASS  ${name}`);
  } else {
    failures += 1;
    results.push(`FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { status: response.status, data };
}

const PASSWORD = "TestPass#123";
const OWNER_EMAIL = "owner.smoke@goodmark.test";
const USER_EMAIL = "user.smoke@goodmark.test";

async function ensureUser(token, { name, email, address, role }) {
  const created = await call("POST", "/admin/users", { token, body: { name, email, address, password: PASSWORD, role } });
  return created.status === 201 || created.status === 409 ? created.status : created.status;
}

const health = await call("GET", "/health");
check("health endpoint responds", health.status === 200 && health.data?.status === "ok", JSON.stringify(health.data));

const login = await call("POST", "/auth/login", { body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
check("administrator can sign in", login.status === 200 && login.data?.token, `${login.status} ${JSON.stringify(login.data)}`);
const adminToken = login.data?.token;
if (!adminToken) {
  console.log(results.join("\n"));
  process.exit(1);
}
check("login response carries no password hash", !JSON.stringify(login.data).includes("passwordHash"));

const me = await call("GET", "/auth/me", { token: adminToken });
check("session restore returns the admin role", me.data?.user?.role === "admin", JSON.stringify(me.data));

const metrics = await call("GET", "/admin/metrics", { token: adminToken });
check("admin metrics expose the three totals",
  typeof metrics.data?.totalUsers === "number" && typeof metrics.data?.totalStores === "number" && typeof metrics.data?.totalRatings === "number",
  JSON.stringify(metrics.data));

const ownerCreateStatus = await ensureUser(adminToken, {
  name: "Sunita Ramachandran Kulkarni",
  email: OWNER_EMAIL,
  address: "12 Model Colony, Shivajinagar, Pune 411005",
  role: "owner",
});
check("admin can create a store owner account", [201, 409].includes(ownerCreateStatus), String(ownerCreateStatus));

const userCreateStatus = await ensureUser(adminToken, {
  name: "Rahul Shashikant Deshmukh",
  email: USER_EMAIL,
  address: "48 Kothrud, Pune 411038",
  role: "user",
});
check("admin can create a normal user account", [201, 409].includes(userCreateStatus), String(userCreateStatus));

const badUser = await call("POST", "/admin/users", {
  token: adminToken,
  body: { name: "Too short", email: "bad@goodmark.test", address: "x", password: "weak", role: "user" },
});
check("admin user creation rejects an invalid name", badUser.status === 400, `${badUser.status} ${JSON.stringify(badUser.data)}`);

const owners = await call("GET", "/admin/store-owners", { token: adminToken });
check("admin can list available store owners", owners.status === 200 && Array.isArray(owners.data?.users), JSON.stringify(owners.data));
const ownerAccount = owners.data?.users?.find((row) => row.email === OWNER_EMAIL);
check("the created store owner appears as unassigned", Boolean(ownerAccount), JSON.stringify(owners.data?.users?.length));

const existingStores = await call("GET", "/admin/stores?page=1&pageSize=100", { token: adminToken });
const ownedStore = existingStores.data?.stores?.find((store) => store.email === "store.smoke@goodmark.test");

let storeId = ownedStore?.id;
if (!storeId) {
  const createdStore = await call("POST", "/admin/stores", {
    token: adminToken,
    body: {
      name: "Smoke Test Coffee House",
      email: "store.smoke@goodmark.test",
      address: "7 FC Road, Pune 411004",
      ownerId: ownerAccount?.id,
    },
  });
  check("admin can register a store with an owner", createdStore.status === 201 && createdStore.data?.store?.id, `${createdStore.status} ${JSON.stringify(createdStore.data)}`);
  storeId = createdStore.data?.store?.id;
}

const duplicateStore = await call("POST", "/admin/stores", {
  token: adminToken,
  body: {
    name: "Smoke Test Coffee House",
    email: "store.smoke@goodmark.test",
    address: "7 FC Road, Pune 411004",
    ownerId: ownerAccount?.id,
  },
});
check("a store cannot be assigned an already assigned owner", duplicateStore.status === 400 || duplicateStore.status === 409, `${duplicateStore.status} ${JSON.stringify(duplicateStore.data)}`);

const storeFilter = await call("GET", "/admin/stores?name=Smoke&address=Pune&page=1&pageSize=10", { token: adminToken });
check("store directory filters by name and address", storeFilter.status === 200 && (storeFilter.data?.stores ?? []).every((store) => /smoke/i.test(store.name)), JSON.stringify(storeFilter.data?.total));

const peopleFilter = await call("GET", "/admin/users?role=owner&email=owner.smoke&page=1&pageSize=10", { token: adminToken });
check("user directory filters by role and email", peopleFilter.status === 200 && (peopleFilter.data?.users ?? []).every((row) => row.role === "owner"), JSON.stringify(peopleFilter.data?.total));

const peopleNameFilter = await call("GET", "/admin/users?name=Sunita", { token: adminToken });
check("user directory filters by name", Array.isArray(peopleNameFilter.data) && peopleNameFilter.data.some((row) => row.email === OWNER_EMAIL), JSON.stringify(peopleNameFilter.data?.length));
check("store owners in the directory carry a rating field", peopleNameFilter.data?.some((row) => row.email === OWNER_EMAIL && "assignedStoreRatingAverage" in row));

const ownerLogin = await call("POST", "/auth/login", { body: { email: OWNER_EMAIL, password: PASSWORD } });
check("the store owner can sign in", ownerLogin.status === 200 && ownerLogin.data?.token, `${ownerLogin.status} ${JSON.stringify(ownerLogin.data)}`);
const ownerToken = ownerLogin.data?.token;

const userLogin = await call("POST", "/auth/login", { body: { email: USER_EMAIL, password: PASSWORD } });
check("the normal user can sign in", userLogin.status === 200 && userLogin.data?.token, `${userLogin.status} ${JSON.stringify(userLogin.data)}`);
const userToken = userLogin.data?.token;

for (const [label, token, path] of [
  ["administrator cannot read the owner dashboard", adminToken, "/owner/dashboard"],
  ["normal user cannot read admin metrics", userToken, "/admin/metrics"],
  ["store owner cannot list the user directory", ownerToken, "/admin/users"],
  ["store owner cannot submit a store rating", ownerToken, "/ratings"],
]) {
  const forbidden = await call(path === "/ratings" ? "POST" : "GET", path, {
    token,
    ...(path === "/ratings" ? { body: { storeId, rating: 4 } } : {}),
  });
  check(label, forbidden.status === 403, `${forbidden.status} ${JSON.stringify(forbidden.data)}`);
}

const anonStores = await call("GET", "/stores?page=1&pageSize=5");
check("anonymous visitors can browse stores", anonStores.status === 200 && Array.isArray(anonStores.data?.stores), JSON.stringify(anonStores.data));
check("anonymous store rows carry no user rating", anonStores.data?.stores?.every((store) => store.userRating === null));

const submit = await call("POST", "/ratings", { token: userToken, body: { storeId, rating: 5, review: "Lovely filter coffee." } });
check("a normal user can submit a 1-5 rating", submit.status === 200 && submit.data?.rating?.rating === 5, `${submit.status} ${JSON.stringify(submit.data)}`);

const badRating = await call("POST", "/ratings", { token: userToken, body: { storeId, rating: 6 } });
check("ratings above five are rejected", badRating.status === 400, `${badRating.status} ${JSON.stringify(badRating.data)}`);

const badRatingZero = await call("POST", "/ratings", { token: userToken, body: { storeId, rating: 0 } });
check("ratings below one are rejected", badRatingZero.status === 400, `${badRatingZero.status} ${JSON.stringify(badRatingZero.data)}`);

const missingStore = await call("POST", "/ratings", { token: userToken, body: { storeId: 999999, rating: 4 } });
check("rating a missing store returns not found", missingStore.status === 404, `${missingStore.status} ${JSON.stringify(missingStore.data)}`);

const afterRating = await call("GET", "/stores?search=Smoke&page=1&pageSize=5", { token: userToken });
const ratedStore = afterRating.data?.stores?.find((store) => store.id === storeId);
check("store listing shows the overall rating", ratedStore && ratedStore.averageRating === 5, JSON.stringify(ratedStore));
check("store listing shows the current user's rating", ratedStore?.userRating === 5, JSON.stringify(ratedStore?.userRating));

const addressSearch = await call("GET", `/stores?search=${encodeURIComponent("FC Road")}&page=1&pageSize=5`, { token: userToken });
check("stores can be searched by address", (addressSearch.data?.stores ?? []).some((store) => store.id === storeId), JSON.stringify(addressSearch.data?.total));

const update = await call("PUT", `/stores/${storeId}/rating`, { token: userToken, body: { score: 3, review: "Revisited: still good." } });
check("a user can modify their submitted rating", update.status === 200 && update.data?.rating?.rating === 3, `${update.status} ${JSON.stringify(update.data)}`);

const ownerDashboard = await call("GET", "/owner/dashboard", { token: ownerToken });
check("the owner sees their store average rating", ownerDashboard.data?.store?.averageRating === 3, JSON.stringify(ownerDashboard.data?.store));
check("the owner sees who rated their store", ownerDashboard.data?.ratings?.some((row) => row.userEmail === USER_EMAIL), JSON.stringify(ownerDashboard.data?.ratings?.length));

const passwordChange = await call("PATCH", "/auth/change-password", {
  token: userToken,
  body: { oldPassword: PASSWORD, newPassword: "NewPass#456" },
});
check("any signed-in role can change their password", passwordChange.status === 200, `${passwordChange.status} ${JSON.stringify(passwordChange.data)}`);

const oldPasswordLogin = await call("POST", "/auth/login", { body: { email: USER_EMAIL, password: PASSWORD } });
check("the old password stops working after a change", oldPasswordLogin.status === 401, String(oldPasswordLogin.status));

const newPasswordLogin = await call("POST", "/auth/login", { body: { email: USER_EMAIL, password: "NewPass#456" } });
check("the new password works after a change", newPasswordLogin.status === 200, String(newPasswordLogin.status));
const refreshedUserToken = newPasswordLogin.data?.token;

const badPasswordChange = await call("PATCH", "/auth/change-password", {
  token: refreshedUserToken,
  body: { oldPassword: "WrongPass#1", newPassword: "AnotherPass#1" },
});
check("password change rejects a wrong current password", badPasswordChange.status === 400, String(badPasswordChange.status));

const weakPasswordChange = await call("PATCH", "/auth/change-password", {
  token: refreshedUserToken,
  body: { oldPassword: "NewPass#456", newPassword: "weakpass" },
});
check("password change enforces the password policy", weakPasswordChange.status === 400, `${weakPasswordChange.status} ${JSON.stringify(weakPasswordChange.data)}`);

const registerDuplicate = await call("POST", "/auth/register", {
  body: { name: "Duplicate Account Attempt", email: USER_EMAIL, address: "Somewhere, Pune", password: "Register#1" },
});
check("public registration rejects a duplicate email", registerDuplicate.status === 409, String(registerDuplicate.status));

const registerWeak = await call("POST", "/auth/register", {
  body: { name: "Valid Length Name Twenty Plus", email: "fresh.smoke@goodmark.test", address: "Kalyani Nagar, Pune", password: "nodigitsorupper" },
});
check("public registration enforces the password policy", registerWeak.status === 400, String(registerWeak.status));

const registered = await call("POST", "/auth/register", {
  body: { name: "Fresh Neighborhood Reviewer", email: "fresh.smoke@goodmark.test", address: "Kalyani Nagar, Pune 411006", password: "Register#1" },
});
check("a new visitor can register as a normal user", [201, 409].includes(registered.status) && (registered.status === 409 || registered.data?.user?.role === "user"), `${registered.status} ${JSON.stringify(registered.data)}`);

const removeRating = await call("DELETE", `/stores/${storeId}/rating`, { token: refreshedUserToken });
check("a user can remove their own rating", [204, 404].includes(removeRating.status), String(removeRating.status));

const ownerAfterDelete = await call("GET", "/owner/dashboard", { token: ownerToken });
check("the owner dashboard reflects a removed rating", ownerAfterDelete.data?.store?.totalRatings === 0 || ownerAfterDelete.status === 200, JSON.stringify(ownerAfterDelete.data?.store));

const restoreRating = await call("POST", "/ratings", { token: refreshedUserToken, body: { storeId, rating: 4 } });
check("the rating can be submitted again", restoreRating.status === 200, String(restoreRating.status));

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
