const { execSync } = require('child_process');
const path = require('path');

console.log("===============================================");
console.log("🚀 STARTING AI CONTENT AGENT FULL CYCLE");
console.log("===============================================\n");

try {
  // Step 1: Refresh data
  console.log("📊 Step 1/3: Processing Instagram & Competitor Data...");
  try {
    execSync('node scripts/fetch_instagram_data.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (e) {
    console.log("⚠️ Live fetch fallback to cached/sample data...");
    execSync('node scripts/generate_sample_data.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  }

  console.log("\n-----------------------------------------------");
  // Step 2: Run 5 AI Agents
  console.log("🤖 Step 2/3: Executing 5 AI Agents via Gemini API...");
  execSync('node scripts/run_agents.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });

  console.log("\n-----------------------------------------------");
  // Step 3: Dispatch Telegram Briefing
  console.log("📨 Step 3/3: Generating & Dispatching Telegram Briefing...");
  execSync('node scripts/telegram_bot.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });

  console.log("\n===============================================");
  console.log("🎉 CYCLE COMPLETE! Dashboard updated & AI Telegram report sent.");
  console.log("===============================================");
} catch (error) {
  console.error("❌ Error executing cycle:", error.message);
  process.exit(1);
}
