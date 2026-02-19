export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { prompt } = req.body;
  const GEMINI_API_KEY = "AIzaSyArxSCLPtLwzuewFcLDhmcz0O-OgNHIXjg";

  // First list available models to find the right name
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`
    );
    const listData = await listRes.json();
    console.log("Available models:", JSON.stringify(listData?.models?.map(m => m.name)));

    // Try generating with the first available model that supports generateContent
    const availableModel = listData?.models?.find(m => 
      m.supportedGenerationMethods?.includes("generateContent")
    );

    if (!availableModel) {
      return res.status(500).json({ error: "No generateContent models found", models: listData });
    }

    console.log("Using model:", availableModel.name);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/${availableModel.name}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
        })
      }
    );

    const data = await response.json();
    console.log("Gemini response:", JSON.stringify(data));

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) {
      return res.status(500).json({ error: "Empty response", raw: JSON.stringify(data) });
    }

    res.status(200).json({ answer });

  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}