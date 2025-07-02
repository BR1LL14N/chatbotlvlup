class ChatBot {
  constructor() {
    this.messageInput = document.getElementById("messageInput");
    this.sendButton = document.getElementById("sendButton");
    this.chatMessages = document.getElementById("chatMessages");
    this.typingIndicator = document.getElementById("typingIndicator");
    this.clearChatBtn = document.getElementById("clearChat");
    this.muteBtn = document.getElementById("muteBtn");
    this.fullscreenBtn = document.getElementById("fullscreenBtn");
    this.isMuted = false;
    this.isTyping = false;
    this.lastAIResponse = null;

    this.initializeEventListeners();
    this.loadChatHistory();
  }

  initializeEventListeners() {
    // Send message events
    this.sendButton.addEventListener("click", () => this.sendMessage());
    this.messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Quick action buttons
    document.querySelectorAll(".quick-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const message = btn.getAttribute("data-message");
        this.messageInput.value = message;
        this.sendMessage();
      });
    });

    // Clear chat
    this.clearChatBtn.addEventListener("click", () => this.clearChat());

    // Character controls
    this.muteBtn.addEventListener("click", () => this.toggleMute());
    this.fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());

    // Input focus management
    this.messageInput.addEventListener("input", () => {
      this.sendButton.disabled = this.messageInput.value.trim() === "";
    });

    // Auto-focus input
    this.messageInput.focus();
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;
    this.addMessage(message, "user");
    this.messageInput.value = "";
    this.sendButton.disabled = true;
    this.showTyping();

    try {
      const result = await this.findSimilarOrQueryAI(message);
      this.hideTyping();
      if (result.isMatch) {
        if (result.shouldConfirm) {
          this.showConfirmation(result.question, result.answer, message);
        } else {
          this.addMessage(result.answer, "bot", result.source);
        }
      } else {
        this.requestNewKnowledge(message);
      }
      this.saveChatHistory();
    } catch (error) {
      this.hideTyping();
      console.error("Gagal memeriksa pertanyaan:", error);
      this.addMessage(
        "Terjadi kesalahan saat memproses permintaan.",
        "bot",
        "error"
      );
    }
  }

  getChatHistory(limit = 10) {
    const messages = Array.from(this.chatMessages.children)
      .slice(-limit)
      .map((msg) => {
        const isUser = msg.classList.contains("flex-row-reverse");
        const content = msg.querySelector("p").textContent;
        return {
          role: isUser ? "user" : "assistant",
          content,
        };
      });

    return messages;
  }

  async useAIService(question) {
    try {
      this.showTyping();
      // Simulasi respons AI
      const aiResponse = await getAIResponseWithHistory(
        question,
        this.getChatHistory()
      );
      this.hideTyping();

      this.addMessage(aiResponse, "bot", "qwen_ai");
      this.lastAIResponse = {
        question,
        answer: aiResponse,
        timestamp: Date.now(),
      };
      this.showAILearningOption();
    } catch (err) {
      this.hideTyping();
      this.addMessage(
        "⚠️ Tidak dapat menghubungi layanan AI saat ini.",
        "bot",
        "error"
      );
    }
  }

  // Simulasi API AI (ganti dengan real API nanti)
  async simulateAIResponse(userMessage) {
    // Di sini Anda bisa panggil API nyata seperti OpenAI
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`Berikut adalah jawaban dari AI: "${userMessage}"`);
      }, 1000);
    });
  }

  checkExactMatch(userMessage) {
    const history = JSON.parse(localStorage.getItem("exactMatches")) || [];
    const normalizedInput = userMessage.trim().toLowerCase();

    // Cari di localStorage cache
    const cached = history.find(
      (item) => item.question.trim().toLowerCase() === normalizedInput
    );
    if (cached) return cached;

    // Jika tidak ketemu di cache, cari sekali di otak.json via API
    fetch("http://localhost:3000/list")
      .then((res) => res.json())
      .then((db) => {
        const exactFromServer = db.find(
          (q) => q.question.trim().toLowerCase() === normalizedInput
        );
        if (exactFromServer) {
          // Simpan ke localStorage untuk pencarian cepat berikutnya
          if (!history.some((q) => q.question === exactFromServer.question)) {
            history.push(exactFromServer);
            localStorage.setItem("exactMatches", JSON.stringify(history));
          }
          this.addMessage(exactFromServer.answer, "bot");
        }
      });

    return null;
  }

  async findSimilarOrQueryAI(userMessage) {
    try {
      const normalizedInput = userMessage.trim().toLowerCase();
      const history = this.getChatHistory(); // Ambil riwayat percakapan

      console.log("Mengirim ke /match untuk cari di otak.json...");

      // Langkah 1: Cek apakah ada di knowledge base lokal via /match
      const matchRes = await fetch("http://localhost:3000/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userQuestion: normalizedInput }),
      });

      const matchResult = await matchRes.json();

      if (matchResult.isMatch) {
        console.log("Jawaban ditemukan di otak.json:", matchResult);
        return matchResult; // Return jawaban dari database lokal
      }

      console.log(
        "Tidak ada jawaban di otak.json, beralih ke AI dengan konteks..."
      );

      // Langkah 2: Kirim ke /ai dengan konteks percakapan
      const aiRes = await fetch("http://localhost:3000/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: normalizedInput,
          history: history,
        }),
      });

      const aiResult = await aiRes.json();

      if (aiResult.success) {
        console.log("Respons dari AI berhasil:", aiResult.response);
        return {
          isMatch: true,
          question: normalizedInput,
          answer: aiResult.response,
          similarity: 1.0,
          source: "qwen_ai",
          shouldConfirm: false,
        };
      } else {
        throw new Error("Gagal mendapatkan respons dari AI");
      }
    } catch (err) {
      console.error("Gagal memeriksa pertanyaan:", err);
      return {
        isMatch: false,
        error: "Tidak dapat menghubungi layanan chatbot.",
      };
    }
  }

  showAILearningOption() {
    if (!this.lastAIResponse) return;

    const learningDiv = document.createElement("div");
    learningDiv.className = "flex space-x-4 animate-slide-in mt-2";
    learningDiv.innerHTML = `
      <div class="w-10 h-10 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center text-white text-sm">
        <i class="fas fa-lightbulb"></i>
      </div>
      <div class="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-3 shadow-md max-w-xs lg:max-w-md border border-green-200">
        <p class="text-slate-700 text-sm">Apakah jawaban ini membantu? Saya bisa mempelajarinya untuk pertanyaan serupa di masa depan.</p>
        <div class="mt-2 flex space-x-2">
          <button class="learn-btn px-3 py-1 bg-green-500 hover:bg-green-600 rounded-full text-white text-xs transition-all duration-300 flex items-center space-x-1">
            <i class="fas fa-brain text-xs"></i>
            <span>Pelajari</span>
          </button>
          <button class="skip-btn px-3 py-1 bg-gray-400 hover:bg-gray-500 rounded-full text-white text-xs transition-all duration-300">
            <span>Lewati</span>
          </button>
        </div>
      </div>
    `;
    this.chatMessages.appendChild(learningDiv);
    this.scrollToBottom();

    const autoRemoveTimer = setTimeout(() => {
      if (learningDiv.parentNode) learningDiv.remove();
    }, 10000);

    learningDiv.querySelector(".learn-btn").addEventListener("click", () => {
      clearTimeout(autoRemoveTimer);
      this.learnFromAI(this.lastAIResponse);
      learningDiv.remove();
    });

    learningDiv.querySelector(".skip-btn").addEventListener("click", () => {
      clearTimeout(autoRemoveTimer);
      learningDiv.remove();
    });
  }

  async learnFromAI(aiResponse) {
    try {
      const response = await fetch("http://localhost:3000/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: aiResponse.question,
          answer: aiResponse.answer,
        }),
      });
      const result = await response.json();
      if (result.success) {
        this.addMessage(
          "✅ Terima kasih! Saya telah mempelajari jawaban ini untuk pertanyaan serupa di masa depan.",
          "bot",
          "system"
        );
      } else {
        this.addMessage(
          "ℹ️ " +
            (result.message ||
              "Pengetahuan ini sudah ada dalam database saya."),
          "bot",
          "system"
        );
      }
      this.lastAIResponse = null; // Reset
      this.saveChatHistory();
    } catch (error) {
      console.error("Error learning from AI:", error);
      this.addMessage(
        "⚠️ Gagal menyimpan pembelajaran. Silakan coba lagi nanti.",
        "bot",
        "error"
      );
    }
  }

  askConfirmation(originalQuestion, answer, userQuestion) {
    const confirmMsg = `Apakah yang Anda maksud adalah "${originalQuestion}"?`;
    this.addMessage(confirmMsg, "bot");

    // Simulasi klik tombol (bisa diganti dengan UI button)
    const confirmed = confirm(`${confirmMsg}\n\nYa / Tidak`);
    if (confirmed) {
      this.addMessage(answer, "bot");
    } else {
      this.requestNewKnowledge(userQuestion);
    }
  }

  requestNewKnowledge(question) {
    const requestDiv = document.createElement("div");
    requestDiv.className = "flex space-x-4 animate-slide-in";
    requestDiv.innerHTML = `
      <div class="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-sm">
        <i class="fas fa-robot"></i>
      </div>
      <div class="bg-white rounded-2xl p-4 shadow-md max-w-xs lg:max-w-md">
        <p class="text-slate-700">Maaf, saya belum tahu jawabannya. Bisakah Anda mengajarkan saya?</p>
        <textarea id="newAnswerInput" class="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" rows="2" placeholder="Tuliskan jawaban untuk pertanyaan tersebut..."></textarea>
        <button id="submitAnswerBtn" class="mt-2 px-4 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300">
          Kirim Jawaban
        </button>
      </div>
    `;
    this.chatMessages.appendChild(requestDiv);
    this.scrollToBottom();

    document.getElementById("submitAnswerBtn").addEventListener("click", () => {
      const newAnswer = document.getElementById("newAnswerInput").value.trim();
      if (newAnswer) {
        fetch("http://localhost:3000/learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, answer: newAnswer }),
        }).then(() => {
          this.addMessage("Terima kasih telah mengajarkan saya!", "bot");
          requestDiv.remove();
          this.saveChatHistory();
        });
      } else {
        alert("Silakan tuliskan jawaban terlebih dahulu.");
      }
    });
  }

  addMessage(content, sender, source = null) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `flex space-x-4 animate-slide-in ${
      sender === "user" ? "flex-row-reverse space-x-reverse" : ""
    }`;

    let avatarClass, iconHTML;
    if (sender === "user") {
      avatarClass = "bg-gradient-to-r from-cyan-500 to-blue-500";
      iconHTML = '<i class="fas fa-user"></i>';
    } else {
      switch (source) {
        case "local_db":
          avatarClass = "bg-gradient-to-r from-green-500 to-blue-500";
          iconHTML = '<i class="fas fa-database"></i>';
          break;
        case "qwen_ai":
          avatarClass = "bg-gradient-to-r from-purple-500 to-pink-500";
          iconHTML = '<i class="fas fa-brain"></i>';
          break;
        case "system":
          avatarClass = "bg-gradient-to-r from-orange-500 to-red-500";
          iconHTML = '<i class="fas fa-cog"></i>';
          break;
        case "error":
          avatarClass = "bg-gradient-to-r from-red-500 to-pink-500";
          iconHTML = '<i class="fas fa-exclamation-triangle"></i>';
          break;
        default:
          avatarClass = "bg-gradient-to-r from-blue-600 to-purple-600";
          iconHTML = '<i class="fas fa-robot"></i>';
      }
    }

    const avatar = document.createElement("div");
    avatar.className = `w-10 h-10 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0 ${avatarClass}`;
    avatar.innerHTML = iconHTML;

    const messageContent = document.createElement("div");
    messageContent.className = `max-w-xs lg:max-w-md rounded-2xl p-4 shadow-md ${
      sender === "user"
        ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-tr-md"
        : "bg-white text-slate-700 rounded-tl-md"
    }`;

    const messageText = document.createElement("p");
    messageText.className = "leading-relaxed text-sm";
    messageText.innerHTML = content;

    const messageFooter = document.createElement("div");
    messageFooter.className = `text-xs mt-2 flex justify-between items-center ${
      sender === "user" ? "text-white/80" : "text-slate-500"
    }`;

    const timeSpan = document.createElement("span");
    timeSpan.textContent = this.getCurrentTime();
    messageFooter.appendChild(timeSpan);

    if (sender === "bot" && source) {
      const sourceSpan = document.createElement("span");
      sourceSpan.className = "opacity-75";
      switch (source) {
        case "local_db":
          sourceSpan.textContent = "📚 DB";
          break;
        case "qwen_ai":
          sourceSpan.textContent = "🤖 AI";
          break;
        case "system":
          sourceSpan.textContent = "⚙️ Sistem";
          break;
        case "error":
          sourceSpan.textContent = "⚠️ Error";
          break;
        default:
          sourceSpan.textContent = "🤖 Bot";
      }
      messageFooter.appendChild(sourceSpan);
    }

    messageContent.appendChild(messageText);
    messageContent.appendChild(messageFooter);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);
    this.chatMessages.appendChild(messageDiv);
    this.scrollToBottom();
  }

  showTyping() {
    this.isTyping = true;
    this.typingIndicator.classList.remove("hidden");
    this.scrollToBottom();
  }

  hideTyping() {
    this.isTyping = false;
    this.typingIndicator.classList.add("hidden");
  }

  scrollToBottom() {
    setTimeout(() => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }, 100);
  }

  getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  clearChat() {
    if (confirm("Apakah Anda yakin ingin menghapus semua pesan?")) {
      this.chatMessages.innerHTML = `
                    <div class="flex space-x-4 animate-slide-in">
                        <div class="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="max-w-xs lg:max-w-md bg-white rounded-2xl rounded-tl-md p-4 shadow-md">
                            <p class="text-slate-700 leading-relaxed">Halo! Saya adalah AI Assistant Anda. Bagaimana saya bisa membantu Anda hari ini?</p>
                            <span class="text-xs text-slate-500 mt-2 block">${this.getCurrentTime()}</span>
                        </div>
                    </div>
                `;
      localStorage.removeItem("chatHistory");
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    const icon = this.muteBtn.querySelector("i");
    icon.className = this.isMuted
      ? "fas fa-volume-mute text-sm"
      : "fas fa-volume-up text-sm";
    if (this.isMuted) {
      this.muteBtn.className =
        "w-10 h-10 bg-red-500 hover:bg-red-600 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-all duration-300 hover:scale-105 shadow-lg";
    } else {
      this.muteBtn.className =
        "w-10 h-10 bg-white/90 hover:bg-white backdrop-blur-sm rounded-full flex items-center justify-center text-orange-700 transition-all duration-300 hover:scale-105 shadow-lg";
    }
  }

  toggleFullscreen() {
    const characterSection = document.querySelector(".w-96");
    const isFullscreen = characterSection.classList.contains("fullscreen-mode");
    if (isFullscreen) {
      characterSection.classList.remove(
        "fullscreen-mode",
        "fixed",
        "top-0",
        "left-0",
        "w-screen",
        "h-screen",
        "z-50"
      );
      characterSection.classList.add("w-96");
      this.fullscreenBtn.querySelector("i").className = "fas fa-expand text-sm";
    } else {
      characterSection.classList.remove("w-96");
      characterSection.classList.add(
        "fullscreen-mode",
        "fixed",
        "top-0",
        "left-0",
        "w-screen",
        "h-screen",
        "z-50"
      );
      this.fullscreenBtn.querySelector("i").className =
        "fas fa-compress text-sm";
    }
  }

  saveChatHistory() {
    const messages = Array.from(this.chatMessages.children).map((msg) => {
      const isBot = !msg.classList.contains("flex-row-reverse");
      const content = msg.querySelector("p").textContent;
      const time = msg.querySelector("span").textContent;
      return { content, sender: isBot ? "bot" : "user", time };
    });
    localStorage.setItem("chatHistory", JSON.stringify(messages));
  }

  loadChatHistory() {
    const history = localStorage.getItem("chatHistory");
    if (history) {
      const messages = JSON.parse(history);
      this.chatMessages.innerHTML = "";
      messages.forEach((msg) => {
        this.addMessageFromHistory(msg.content, msg.sender, msg.time);
      });
    }
  }

  addMessageFromHistory(content, sender, time) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `flex space-x-4 animate-slide-in ${
      sender === "user" ? "flex-row-reverse space-x-reverse" : ""
    }`;
    const avatar = document.createElement("div");
    avatar.className = `w-10 h-10 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0 ${
      sender === "user"
        ? "bg-gradient-to-r from-cyan-500 to-blue-500"
        : "bg-gradient-to-r from-blue-600 to-purple-600"
    }`;
    avatar.innerHTML =
      sender === "user"
        ? '<i class="fas fa-user"></i>'
        : '<i class="fas fa-robot"></i>';
    const messageContent = document.createElement("div");
    messageContent.className = `max-w-xs lg:max-w-md rounded-2xl p-4 shadow-md ${
      sender === "user"
        ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-tr-md"
        : "bg-white text-slate-700 rounded-tl-md"
    }`;
    const messageText = document.createElement("p");
    messageText.className = "leading-relaxed";
    messageText.innerHTML = content;
    const messageTime = document.createElement("span");
    messageTime.className = `text-xs mt-2 block ${
      sender === "user" ? "text-white/80" : "text-slate-500"
    }`;
    messageTime.textContent = time;
    messageContent.appendChild(messageText);
    messageContent.appendChild(messageTime);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);
    this.chatMessages.appendChild(messageDiv);
  }

  showConfirmation(question, answer, originalMessage) {
    const confirmDiv = document.createElement("div");
    confirmDiv.className = "flex space-x-4 animate-slide-in";
    confirmDiv.innerHTML = `
        <div class="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-sm">
          <i class="fas fa-robot"></i>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-md max-w-xs lg:max-w-md">
          <p class="text-slate-700">Apakah maksud Anda "<strong>${question}</strong>"?</p>
          <div class="mt-3 flex space-x-2">
            <button class="confirm-btn w-8 h-8 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center text-white transition-all duration-300">
              <i class="fas fa-check text-sm"></i>
            </button>
            <button class="deny-btn w-8 h-8 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-all duration-300">
              <i class="fas fa-times text-sm"></i>
            </button>
          </div>
        </div>
      `;
    this.chatMessages.appendChild(confirmDiv);
    this.scrollToBottom();

    // Event listener untuk tombol
    confirmDiv.querySelector(".confirm-btn").addEventListener("click", () => {
      this.addMessage(answer, "bot");
      confirmDiv.remove();
      this.saveChatHistory();
    });

    confirmDiv.querySelector(".deny-btn").addEventListener("click", () => {
      confirmDiv.remove();
      this.requestNewKnowledge(originalMessage);
    });
  }
}
async function getAIResponseWithHistory(userMessage, history) {
  try {
    const response = await axios.post("http://localhost:3000/ai", {
      userMessage,
      history,
    });
    return response.data.response;
  } catch (error) {
    console.error("Error fetching AI response:", error);
    return "⚠️ Terjadi kesalahan saat menghubungi AI.";
  }
}

function displayAIResponse(text) {
  // Ganti newline dengan <br> agar terlihat rapi di HTML
  const formattedText = text.replace(/\n/g, "<br>");

  const chatContainer = document.getElementById("chat-container");
  const messageElem = document.createElement("div");
  messageElem.classList.add("ai-message");
  messageElem.innerHTML = formattedText;
  chatContainer.appendChild(messageElem);

  // Scroll ke bawah otomatis
  chatContainer.scrollTop = chatContainer.scrollHeight;
}
  
  // Initialize the chatbot when the page loads
  document.addEventListener("DOMContentLoaded", () => {
    new ChatBot();
  });