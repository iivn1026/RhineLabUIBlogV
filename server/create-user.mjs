// Administrative bootstrap. Password is read from stdin, never an argument.
import { openStore, createUser } from "./store.mjs";
const [username, role = "reader", extra] = process.argv.slice(2);
if (!username || extra !== undefined) throw new Error("Usage: node server/create-user.mjs <username> [admin|reader] (password on stdin)");
if (process.stdin.isTTY) throw new Error("Use deploy/windows/Create-User.ps1 for hidden input, or provide the password through stdin.");
let password = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  password += chunk;
  if (password.length > 1024) throw new Error("Password input is too long.");
}
// Remove one transport newline, preserving intentional trailing spaces.
password = password.replace(/\r?\n$/, "");
if (/[\r\n]/.test(password)) throw new Error("Provide one password on stdin.");
const db = openStore();
try { const user = createUser(db, username, password, role); console.log(`Created ${user.role} account: ${user.username}`); }
finally { db.close(); }
