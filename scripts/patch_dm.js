const fs = require('fs');

const file1 = 'dashboard/data/agents_output.json';
const file2 = 'dashboard/agents_output.json';

const a = JSON.parse(fs.readFileSync(file1, 'utf8'));

const dmText = `### 1. New follower who says "bro great content keep it up"
* **Goal:** Build rapport and turn a casual follower into an active fan.
* **The DM:**
> "Thanks a lot for the support, bro! 🙌 Really glad you're finding the AI workflows helpful. Let me know if you ever need any specific tool recommendations!"

### 2. Someone asking "which AI tools do you use?"
* **Goal:** Share core tech stack and drive engagement.
* **The DM:**
> "Hey! My daily stack is Claude for writing, Cursor for coding, and ChatGPT for quick ideation. I have a full list with free alternatives — comment 'FREE' on my latest post and I'll send the link over!"

### 3. Someone asking "how do I start with AI/automation?"
* **Goal:** Direct to foundational content.
* **The DM:**
> "Hey man! Start by picking ONE repetitive task in your workflow and automating it with Make.com or ChatGPT prompts. Check out my pinned Reel — I break down the exact step-by-step framework!"

### 4. Collab request from another creator
* **Goal:** Friendly networking with clear criteria.
* **The DM:**
> "Hey bro! Appreciate you reaching out — love your content. Drop your idea or concept here and let's see how we can build something high-value together for both our audiences!"

### 5. Someone asking "can you make a video on [topic]?"
* **Goal:** Validate demand and log request.
* **The DM:**
> "That's a killer topic idea! Adding it directly to my content queue for next week. Drop a quick comment on my latest post so I can tag you when it drops!"

### 6. Brand/sponsor reaching out for paid partnership
* **Goal:** Professional intake.
* **The DM:**
> "Hey! Thanks for reaching out. Please send over your campaign brief and deliverables to my business email: garvitb.business@gmail.com and my team will revert with rates and availability!"

### 7. Someone who says "your content helped me a lot, thank you"
* **Goal:** Genuine appreciation & community retention.
* **The DM:**
> "Comments like this make my day, man! 🙏 Really happy to hear the AI tutorials are helping you build faster. Appreciate you being part of the community!"

### 8. Someone asking "are you available for 1-on-1 consulting?"
* **Goal:** Qualify high-ticket intent.
* **The DM:**
> "Hey! I do a limited number of 1-on-1 AI automation strategy sessions each month. Drop me a line at garvitb.business@gmail.com with your project goals and I'll send over details!"`;

a.dm_manager = dmText;
if (a.agents) a.agents.dm_manager = dmText;

fs.writeFileSync(file1, JSON.stringify(a, null, 2), 'utf8');
fs.writeFileSync(file2, JSON.stringify(a, null, 2), 'utf8');
console.log('✅ Clean DM Manager output saved to both paths!');
