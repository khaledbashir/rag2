import puppeteer from "puppeteer";

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background: white; }
  .page { width: 8.5in; min-height: 11in; margin: 0 auto; padding: 0; }
  .green-bar { background: #1a7a3a; height: 60px; width: 100%; }
  .content { padding: 40px 60px; }
  .logo { font-size: 28px; font-weight: 700; color: #1a1a1a; letter-spacing: 1px; margin-bottom: 30px; }
  .logo span { color: #1a7a3a; font-size: 32px; margin-right: 4px; }
  .divider { width: 40px; height: 3px; background: #1a7a3a; margin-bottom: 24px; }
  .join { font-size: 13px; text-transform: uppercase; letter-spacing: 3px; color: #666; margin-bottom: 8px; }
  .title { font-size: 26px; font-weight: 700; color: #1a7a3a; margin-bottom: 12px; line-height: 1.3; }
  .date { font-size: 15px; color: #444; margin-bottom: 30px; }
  .image-placeholder {
    width: 100%; height: 320px;
    background: linear-gradient(135deg, #e8e8e8 0%, #d0d0d0 100%);
    border-radius: 4px; margin-bottom: 30px;
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .building-img {
    width: 100%; height: 100%; object-fit: cover;
  }
  .rsvp-btn {
    display: inline-block;
    background: #1a7a3a;
    color: white;
    padding: 14px 36px;
    font-size: 15px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 2px;
    text-decoration: none;
    border-radius: 4px;
    margin-bottom: 40px;
  }
  .event-header {
    font-size: 16px; font-weight: 700; color: #c0392b;
    text-transform: uppercase; letter-spacing: 2px;
    margin-bottom: 16px;
  }
  .event-details { font-size: 14px; color: #333; line-height: 1.8; }
  .event-details strong { color: #1a1a1a; }
  .footer {
    margin-top: 40px; padding-top: 20px;
    border-top: 1px solid #e0e0e0;
    font-size: 11px; color: #999; line-height: 1.6;
  }
</style>
</head>
<body>
<div class="page">
  <div class="green-bar"></div>
  <div class="content">
    <div class="logo"><span>K</span> LeCHASE</div>
    <div class="divider"></div>
    <div class="join">JOIN LECHASE FOR A</div>
    <div class="title">Pre-bid M/WBE / SDVOB Meet & Greet</div>
    <div class="date">Wednesday, March 25 | 9:00 - 10:00AM | Zoom</div>

    <div class="image-placeholder">
      <img src="https://i.imgur.com/placeholder.jpg" onerror="this.style.display='none'" class="building-img">
      <div style="position:absolute; color: #888; font-size: 14px;">NYS DOT Central Testing Laboratory</div>
    </div>

    <a href="#" class="rsvp-btn">CLICK TO RSVP →</a>

    <div class="event-header">EVENT DETAILS:</div>
    <div class="event-details">
      <p><strong>Project:</strong> OGS/NYS DOT's new Central Testing Laboratory</p>
      <p><strong>Date:</strong> Wednesday, March 25, 2026</p>
      <p><strong>Time:</strong> 9:00 AM - 10:00 AM (Eastern)</p>
      <p><strong>Location:</strong> Zoom (Virtual)</p>
      <p><strong>Host:</strong> LeChase Construction</p>
      <p style="margin-top: 16px;">LeChase is seeking M/WBE and SDVOB subcontractors for participation in the OGS/NYS DOT Central Testing Laboratory project. Join us for a pre-bid meet and greet session to learn about upcoming opportunities.</p>
    </div>

    <div class="footer">
      <p>LeChase Construction | xbeteam@lechase.com</p>
      <p>Sent to: Stephanie Pennington</p>
    </div>
  </div>
</div>
</body>
</html>`;

async function generate() {
  const { writeFileSync } = require("fs");
  writeFileSync("/tmp/lechase-flyer.html", html);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: "/tmp/LeChase_PreBid_MeetGreet_March25.pdf",
    width: "8.5in",
    height: "11in",
    printBackground: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
  });
  await browser.close();
  console.log("PDF saved to /tmp/LeChase_PreBid_MeetGreet_March25.pdf");
}

generate().catch(console.error);
