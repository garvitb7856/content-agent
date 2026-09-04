const fs = require('fs');
const path = require('path');

const SECOND_BRAIN_DIR = path.join(__dirname, '../second_brain');
const DASHBOARD_SB_DIR = path.join(__dirname, '../dashboard/second_brain');
const ACTIVE_PLAN_PATH = path.join(SECOND_BRAIN_DIR, 'active_plan.json');
const DASHBOARD_PLAN_PATH = path.join(DASHBOARD_SB_DIR, 'active_plan.json');
const AGENTS_OUTPUT_PATH = path.join(__dirname, '../dashboard/data/agents_output.json');

function ensureDirs() {
  fs.mkdirSync(SECOND_BRAIN_DIR, { recursive: true });
  fs.mkdirSync(DASHBOARD_SB_DIR, { recursive: true });
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, numDays) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + numDays);
  return d.toISOString().split('T')[0];
}

function parsePlannerText(text, startDateStr) {
  const days = [];
  const startDate = new Date(startDateStr);
  
  const dayBlocks = text.split(/(?=##?\s*DAY\s*\d+)/i);
  let dayIdx = 0;

  for (const block of dayBlocks) {
    if (!block.match(/##?\s*DAY\s*\d+/i)) continue;
    dayIdx++;
    if (dayIdx > 7) break;
    
    const targetDate = new Date(startDate);
    targetDate.setDate(startDate.getDate() + (dayIdx - 1));
    const dateStr = targetDate.toISOString().split('T')[0];

    const topicMatch = block.match(/\*\*Topic:\*\*\s*([^\n]+)/i) || block.match(/Topic:\s*([^\n]+)/i);
    const topic = topicMatch ? topicMatch[1].trim() : `Day ${dayIdx} Content Topic`;

    const fmtMatch = block.match(/\*\*Format:\*\*\s*([^\n]+)/i) || block.match(/Format:\s*([^\n]+)/i);
    const rawFmt = fmtMatch ? fmtMatch[1].trim() : "Reel";
    const format = rawFmt.toLowerCase().includes("carousel") ? "Carousel" : "Reel";

    const timeMatch = block.match(/\*\*Post Time:\*\*\s*([^\n]+)/i) || block.match(/Post Time:\s*([^\n]+)/i);
    const post_time = timeMatch ? timeMatch[1].trim() : "6:00 PM IST";

    const hookMatch = block.match(/\*\*Hook:\*\*\s*([^\n]+)/i) || block.match(/Hook:\s*([^\n]+)/i);
    const hook = hookMatch ? hookMatch[1].trim() : "";

    days.push({
      day: dayIdx,
      date: dateStr,
      topic: topic,
      format: format,
      post_time: post_time,
      hook: hook,
      status: "pending"
    });
  }

  while (days.length < 7) {
    const idx = days.length + 1;
    const targetDate = new Date(startDate);
    targetDate.setDate(startDate.getDate() + (idx - 1));
    days.push({
      day: idx,
      date: targetDate.toISOString().split('T')[0],
      topic: `Day ${idx} Content Topic`,
      format: "Reel",
      post_time: "6:00 PM IST",
      hook: "Viral hook strategy",
      status: "pending"
    });
  }

  return days;
}

function run() {
  ensureDirs();
  const today = getTodayStr();

  if (fs.existsSync(ACTIVE_PLAN_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(ACTIVE_PLAN_PATH, 'utf8'));
      if (existing && existing.end_date && today <= existing.end_date) {
        console.log(`Active plan is still valid until ${existing.end_date}. Skipping planner regeneration.`);
        // Ensure dashboard copy is in sync
        fs.writeFileSync(DASHBOARD_PLAN_PATH, JSON.stringify(existing, null, 2), 'utf8');
        return;
      }
    } catch (e) {
      console.warn("⚠️ Warning reading existing active_plan.json:", e.message);
    }
  }

  // Create new active plan
  if (!fs.existsSync(AGENTS_OUTPUT_PATH)) {
    console.error("❌ agents_output.json not found to generate active plan.");
    return;
  }

  const aiOutput = JSON.parse(fs.readFileSync(AGENTS_OUTPUT_PATH, 'utf8'));
  const plannerText = aiOutput.planner || "";
  const days = parsePlannerText(plannerText, today);

  const plan = {
    generated_on: today,
    end_date: addDays(today, 7),
    days: days
  };

  fs.writeFileSync(ACTIVE_PLAN_PATH, JSON.stringify(plan, null, 2), 'utf8');
  fs.writeFileSync(DASHBOARD_PLAN_PATH, JSON.stringify(plan, null, 2), 'utf8');

  console.log(`✅ Locked 7-day plan created (${plan.generated_on} to ${plan.end_date}).`);
}

run();
