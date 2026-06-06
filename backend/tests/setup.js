// Vitest setup — runs before every test file.
// Forces test environment variables and silences expected-error console output.

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-do-not-use-in-prod";
process.env.MONGO_URI = "mongodb://localhost:27017/test"; // not connected — see mongoose.mock
process.env.PORT = "0"; // bind to ephemeral port
process.env.CLIENT_URL = "http://localhost:5173";

// Reduce noise from expected error logs during negative-path tests
const origError = console.error;
console.error = (...args) => {
  const msg = args[0]?.toString?.() || "";
  // Suppress expected errors we deliberately trigger in negative tests
  if (msg.includes("ValidationError") || msg.includes("CastError") || msg.includes("E11000")) {
    return;
  }
  origError.apply(console, args);
};
