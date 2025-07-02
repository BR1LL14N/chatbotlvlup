require("dotenv").config(); // ← WAJIB di paling atas
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios"); // Tambahkan axios untuk HTTP requests
const levenshtein = require("fast-levenshtein");
const SIMILARITY_THRESHOLD = 0.6;
const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, "data", "otak.json");

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// QwenAI Configuration
const QWEN_CONFIG = {
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "qwen/qwen3-235b-a22b:free",
  headers: {
    "HTTP-Referer": "http://localhost:3000", // ganti sesuai domain kamu
    "X-Title": "AI Chatbot",
  },
};

if (!QWEN_CONFIG.apiKey) {
  console.warn("⚠️ API Key belum dikonfigurasikan!");
}

module.exports = QWEN_CONFIG;

// Stopwords untuk normalisasi teks
const stopwords = [
  "apa",
  "apakah",
  "yang",
  "tahu",
  "ada",
  "untuk",
  "dalam",
  "dan",
  "di",
  "sebuah",
  "anda",
  "saya",
  "kamu",
  "ini",
  "itu",
  "dengan",
  "dari",
  "ke",
  "pada",
  "akan",
  "sudah",
  "telah",
  "bisa",
  "dapat",
  "mau",
  "ingin",
];

function normalizeText(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
}
// Fungsi untuk merapikan respon AI
function cleanAIResponse(text) {
  if (!text) return "";

  let cleaned = text.trim();

  // Ganti heading markdown ### menjadi judul biasa
  cleaned = cleaned.replace(
    /###\s*(.*)/g,
    '<h4 class="font-bold mt-4 mb-2">$1</h4>'
  );

  // Ganti bold **text** menjadi <strong>text</strong>
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Ganti italic *text* menjadi <em>$1</em>
  cleaned = cleaned.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Ganti garis horizontal --- menjadi hr
  cleaned = cleaned.replace(/---+/g, "<hr>");

  // Bersihkan spasi dan newlines berlebihan
  cleaned = cleaned.replace(/[\r\n]+/g, "\n");
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");

  // Ganti newline (\n) dengan <br>
  cleaned = cleaned.replace(/\n/g, "<br>");

  // Jika ingin menambahkan list bullet points:
  // Contoh: - Item => <ul><li>Item</li></ul>
  cleaned = cleaned.replace(
    /(?:\r?\n)+- (.+)/g,
    (match, p1) => `<ul class="list-disc ml-5"><li>${p1}</li></ul>`
  );

  // Jika ingin menambahkan ordered list (1., 2., dst)
  cleaned = cleaned.replace(
    /(?:\r?\n)+\d+\. (.+)/g,
    (match, p1) => `<ol class="list-decimal ml-5"><li>${p1}</li></ol>`
  );

  return cleaned;
}



// Fungsi untuk menghitung similarity dengan improved algorithm
function calculateSimilarity(str1, str2) {
  const levDist = levenshtein.get(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - levDist / maxLength;
}

// Fungsi untuk query ke QwenAI
async function queryQwenAI(userMessage) {
  try {
    const response = await axios.post(
      `${QWEN_CONFIG.baseURL}/chat/completions`,
      {
        model: QWEN_CONFIG.model,
        messages: [
          {
            role: "system",
            content:
              "Anda adalah asisten AI yang membantu dalam bahasa Indonesia. Berikan jawaban yang informatif, ramah, dan sesuai konteks.",
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${QWEN_CONFIG.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": QWEN_CONFIG.headers["HTTP-Referer"],
          "X-Title": QWEN_CONFIG.headers["X-Title"],
        },
      }
    );

    // Ambil konten asli dari AI
    let rawResponse = response.data.choices[0].message.content;

    // Bersihkan teks agar lebih rapi
    const cleanedResponse = cleanAIResponse(rawResponse);

    return {
      success: true,
      response: cleanedResponse,
      source: "qwen_ai",
    };
  } catch (error) {
    console.error(
      "Error querying QwenAI:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: "Maaf, terjadi kesalahan saat menghubungi AI. Silakan coba lagi.",
      source: "error",
    };
  }
}

// Route utama
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Fungsi untuk mencari eksak match
// Fungsi untuk mencari eksak match
function findExactMatch(userQuestion, db) {
  const normalizedInput = normalizeText(userQuestion);
  return db.find((q) => normalizeText(q.question) === normalizedInput);
}

// Endpoint /match

app.post("/match", async (req, res) => {
  const { userQuestion } = req.body;

  if (!userQuestion || userQuestion.trim() === "") {
    return res.status(400).json({ error: "Pertanyaan tidak boleh kosong" });
  }

  try {
    // Baca database lokal
    const data = await fs.promises.readFile(DB_PATH, "utf8");
    const db = JSON.parse(data);

    // Cari eksak match terlebih dahulu
    const exactMatch = findExactMatch(userQuestion, db);
    if (exactMatch) {
      console.log(`Exact match found: ${exactMatch.question}`);
      return res.json({
        isMatch: true,
        question: exactMatch.question,
        answer: exactMatch.answer,
        source: "local_db",
        shouldConfirm: false, // Tidak perlu konfirmasi
      });
    }

    // Jika tidak ada eksak match, cari mirip
    let bestMatch = null;
    let highestSimilarity = 0;

    for (let i = 0; i < db.length; i++) {
      const similarity = calculateSimilarity(userQuestion, db[i].question);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = {
          ...db[i],
          similarity: similarity,
        };
      }
    }

    if (bestMatch && highestSimilarity >= SIMILARITY_THRESHOLD) {
      console.log(
        `Similar match found: ${
          bestMatch.question
        } (similarity: ${highestSimilarity.toFixed(2)})`
      );
      return res.json({
        isMatch: true,
        question: bestMatch.question,
        answer: bestMatch.answer,
        similarity: highestSimilarity,
        source: "local_db",
        shouldConfirm: true, // Butuh konfirmasi
      });
    }

    // Jika tidak ada match lokal, query ke QwenAI
    console.log("No local match found, querying QwenAI...");
    const aiResponse = await queryQwenAI(userQuestion);

    if (aiResponse.success) {
      // Simpan interaksi ke queue untuk pembelajaran masa depan
      // (opsional, bisa diaktifkan jika diinginkan)
      // await saveInteractionToQueue(userQuestion, aiResponse.response);

      return res.json({
        isMatch: true,
        question: userQuestion,
        answer: aiResponse.response,
        similarity: 1.0,
        source: "qwen_ai",
        shouldConfirm: false,
      });
    } else {
      return res.json({
        isMatch: false,
        error: aiResponse.error,
        source: "error",
      });
    }
  } catch (error) {
    console.error("Error in /match endpoint:", error);
    res.status(500).json({ error: "Gagal membaca database" });
  }
});

// Endpoint: Tambahkan pertanyaan baru ke database lokal
app.post("/learn", async (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return res
      .status(400)
      .json({ error: "Pertanyaan dan jawaban harus diisi" });
  }

  try {
    const data = await fs.promises.readFile(DB_PATH, "utf8");
    const db = JSON.parse(data);

    // Cek apakah pertanyaan sudah ada
    const exists = db.some(
      (item) => calculateSimilarity(question, item.question) > 0.9
    );

    if (exists) {
      return res.json({
        success: false,
        message: "Pertanyaan serupa sudah ada di database",
      });
    }

    // Tambahkan pertanyaan baru
    db.push({
      question: question.trim(),
      answer: answer.trim(),
      created_at: new Date().toISOString(),
    });

    await fs.promises.writeFile(DB_PATH, JSON.stringify(db, null, 2));

    console.log(`New knowledge added: ${question}`);
    res.json({
      success: true,
      message: "Pengetahuan baru berhasil ditambahkan",
    });
  } catch (error) {
    console.error("Error in /learn endpoint:", error);
    res.status(500).json({ error: "Gagal menyimpan pengetahuan baru" });
  }
});

// Endpoint: Lihat semua knowledge base (untuk debugging)
app.get("/list", async (req, res) => {
  try {
    const data = await fs.promises.readFile(DB_PATH, "utf8");
    const db = JSON.parse(data);
    res.json({
      total: db.length,
      data: db,
    });
  } catch (error) {
    console.error("Error in /list endpoint:", error);
    res.status(500).json({ error: "Gagal membaca database" });
  }
});

// Endpoint: Statistik penggunaan
app.get("/stats", async (req, res) => {
  try {
    const data = await fs.promises.readFile(DB_PATH, "utf8");
    const db = JSON.parse(data);

    res.json({
      local_knowledge_count: db.length,
      qwen_model: QWEN_CONFIG.model,
      similarity_threshold: 0.4,
      server_status: "running",
    });
  } catch (error) {
    res.status(500).json({ error: "Gagal mendapatkan statistik" });
  }
});

// Fungsi helper untuk menyimpan interaksi AI (opsional)
// async function saveInteractionToQueue(question, answer) {
//   const queuePath = path.join(__dirname, "data", "ai_interactions.json");

//   try {
//     let queue = [];
//     if (fs.existsSync(queuePath)) {
//       const data = await fs.promises.readFile(queuePath, "utf8");
//       queue = JSON.parse(data);
//     }

//     queue.push({
//       question,
//       answer,
//       timestamp: new Date().toISOString(),
//       source: "qwen_ai",
//     });

//     // Batasi queue maksimal 100 interaksi
//     if (queue.length > 100) {
//       queue = queue.slice(-100);
//     }

//     await fs.promises.writeFile(queuePath, JSON.stringify(queue, null, 2));
//   } catch (error) {
//     console.error("Error saving AI interaction:", error);
//   }
// }

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Terjadi kesalahan pada server" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan" });
});

// Endpoint baru untuk AI dengan konteks
app.post("/ai", async (req, res) => {
  const { userMessage, history } = req.body;
  if (!userMessage || !history || !Array.isArray(history)) {
    return res
      .status(400)
      .json({ error: "Data tidak lengkap atau salah format." });
  }

  try {
    // Format riwayat percakapan agar lebih mudah dipahami AI
    const conversationContext = history
      .map((msg) => {
        return `${msg.role === "user" ? "Pengguna" : "Asisten"}: ${
          msg.content
        }`;
      })
      .join("\n");

    const fullPrompt = `
Berikut adalah percakapan sebelumnya antara Pengguna dan Asisten:
${conversationContext}

Sekarang, pengguna bertanya:
"${userMessage}"

Silakan jawab pertanyaan tersebut dengan mempertimbangkan konteks percakapan sebelumnya.
Jika diperlukan, gunakan informasi dari percakapan sebelumnya untuk menjawab secara akurat.

Contoh:
Jika pengguna sebelumnya membicarakan "Attack on Titan", dan sekarang bertanya "Siapa penulisnya?", Anda harus tahu bahwa "penulis" merujuk pada Hajime Isayama.
`;

    const aiResponse = await queryQwenAI(fullPrompt);

    if (aiResponse.success) {
      res.json({
        success: true,
        response: aiResponse.response,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Gagal mendapatkan jawaban dari AI.",
      });
    }
  } catch (error) {
    console.error("Error in /ai endpoint:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`📊 QwenAI Model: ${QWEN_CONFIG.model}`);
  console.log(`🔑 API Key: ${QWEN_CONFIG.apiKey ? "Configured" : "NOT SET!"}`);
});
