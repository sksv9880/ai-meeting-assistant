(function () {
  const HOST_ID = 'chrome-url-sender-floating-host';

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'showQuestions') {
      createFloatingUI(message.data, message.autoPolling);
    } else if (message.action === 'showDashboard') {
      createFloatingUI(null, message.autoPolling);
    } else if (message.action === 'hideDashboard') {
      removeFloatingUI();
    }
    sendResponse({ status: "received" });
  });

  function removeFloatingUI() {
    const host = document.getElementById(HOST_ID);
    if (host) {
      host.remove();
    }
  }

  function createFloatingUI(data, autoPollingState = true) {
    let host = document.getElementById(HOST_ID);
    let card, contentArea, shadow;

    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      document.body.appendChild(host);

      shadow = host.attachShadow({ mode: 'open' });

      // Styles
      const style = document.createElement('style');
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Poppins:wght@400;500;600;700&display=swap');

        :host {
          all: initial;
          z-index: 2147483647;
          position: fixed;
          top: 0; right: 0; bottom: 0;
          font-family: 'Lato', sans-serif;
          pointer-events: none;
        }

        * { box-sizing: border-box; }

        .card {
          pointer-events: auto;
          background: #EEF6FF;
          width: 380px;
          height: 100%;
          border-left: 1px solid #D1D1D1;
          box-shadow: -5px 0 20px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          transition: height 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s ease;
          overflow: hidden;
        }

        .card.minimized {
          height: 75px !important; /* Adjust to match header height approx */
          border-bottom-left-radius: 12px;
        }

        /* Header */
        .header {
          padding: 20px 24px;
          background: #FFFFFF;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: move;
          user-select: none;
          border-bottom: 1px solid rgba(0,0,0,0.05);
          height: 75px; 
          flex-shrink: 0;
        }

        .title {
          font-family: 'Poppins', sans-serif;
          font-size: 21px;
          font-weight: 700;
          color: #282828;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .status-dot {
          width: 10px;
          height: 10px;
          background-color: #4CAF50;
          border-radius: 50%;
          display: inline-block;
          box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.2);
        }

        .controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .toggle-container {
             display: flex;
             align-items: center;
        }
        
        /* Toggle Switch */
        .switch {
            position: relative;
            display: inline-block;
            width: 36px;
            height: 20px;
        }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
            background-color: #D1D1D1;
            transition: .4s;
            border-radius: 34px;
        }
        .slider:before {
            position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .slider { background-color: #4CAF50; }
        input:checked + .slider:before { transform: translateX(16px); }

        .icon-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #718096;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s;
        }
        .icon-btn:hover { background: rgba(0,0,0,0.05); color: #282828; }
        .icon-btn svg { width: 20px; height: 20px; }

        .close-btn:hover { background: #fee2e2; color: #e53e3e; }

        /* Content */
        .content {
          padding: 24px;
          flex: 1;
          overflow-y: auto;
          color: #3D3D3D;
          font-size: 16px;
        }
           /* Scrollbar */
        .content::-webkit-scrollbar { width: 6px; }
        .content::-webkit-scrollbar-thumb { background-color: #D9EAFF; border-radius: 10px; }

        .content.empty {
            display: flex; align-items: center; justify-content: center; text-align: center; color: #718096;
        }

        /* Batches */
        .batch-container { margin-bottom: 30px; }
        
        .reason-header {
            display: flex; align-items: center; gap: 12px;
            font-family: 'Poppins', sans-serif;
            font-weight: 500;
            font-size: 16px;
            color: #282828;
            margin-bottom: 16px;
        }
        
        .reason-dot {
            width: 12px; height: 12px;
            background-color: #4187FF;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .question-list { list-style: none; padding: 0; margin: 0; }

        .question-item {
            background: #FFFFFF;
            border: 1px solid #D1D1D1; /* Stroke */
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 16px;
            position: relative;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
            animation: fadeIn 0.5s ease;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .question-body {
            display: flex; gap: 12px; align-items: flex-start;
        }

        .question-mark {
            color: #4187FF;
            font-family: 'Poppins', sans-serif;
            font-weight: 600;
            font-size: 18px;
            flex-shrink: 0;
            line-height: 1.4;
        }

        .question-text {
            font-family: 'Lato', sans-serif;
            font-size: 16px;
            color: #3D3D3D;
            line-height: 1.5;
            font-weight: 400;
        }

        .question-actions {
            display: flex; gap: 10px; margin-top: 12px; padding-left: 20px;
        }

        .action-btn {
            background: #D9EAFF; /* Circle color for button bg */
            border: none;
            width: 28px; height: 28px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            color: #4187FF;
            transition: all 0.2s;
        }
        .action-btn:hover { background: #4187FF; color: white; }
        .action-btn svg { width: 14px; height: 14px; }


        /* Footer */
        .footer {
            padding: 20px;
            background: #BCDAFF; /* Minutes of Meeting Btn Color as base or gradient? Using split style */
            display: flex;
            height: 60px;
            padding: 0;
            flex-shrink: 0;
        }

        .footer-btn {
            flex: 1;
            border: none;
            cursor: pointer;
            font-family: 'Lato', sans-serif;
            font-size: 17px; /* Reduced to guarantee single line */
            font-weight: 400;
            color: #282828;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            white-space: nowrap; /* Force single line */
            transition: background 0.2s;
        }

        .btn-summarize {
            background: #8EC4FF;
        }
        .btn-summarize:hover { background: #7ab3f5; }

        .btn-mom {
            background: #BCDAFF;
        }
        .btn-mom:hover { background: #a8ccf5; }

        .footer-icon { width: 18px; height: 18px; stroke-width: 2; }
      `;
      shadow.appendChild(style);

      card = document.createElement('div');
      card.className = 'card';

      // Header
      const header = document.createElement('div');
      header.className = 'header';

      const title = document.createElement('div');
      title.className = 'title';
      title.innerHTML = '<span class="status-dot"></span> Side-kick';

      // Controls Container
      const controls = document.createElement('div');
      controls.className = 'controls';

      // Toggle
      const toggleContainer = document.createElement('div');
      toggleContainer.className = 'toggle-container';

      const switchLabel = document.createElement('label');
      switchLabel.className = 'switch';
      switchLabel.title = 'Pause/Resume';

      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = autoPollingState;

      const sliderSpan = document.createElement('span');
      sliderSpan.className = 'slider round';

      switchLabel.appendChild(toggleInput);
      switchLabel.appendChild(sliderSpan);
      toggleContainer.appendChild(switchLabel);

      controls.appendChild(toggleContainer);

      header.appendChild(title);
      header.appendChild(controls);
      card.appendChild(header);

      // Content
      contentArea = document.createElement('div');
      contentArea.className = 'content empty'; // Start with empty class
      contentArea.textContent = 'Waiting for questions...';
      card.appendChild(contentArea);

      // Footer
      const footer = document.createElement('div');
      footer.className = 'footer';

      // Summarize Btn
      const sumBtn = document.createElement('button');
      sumBtn.className = 'footer-btn btn-summarize';
      sumBtn.innerHTML = `
        <svg class="footer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="21" y1="6" x2="3" y2="6"></line>
          <line x1="21" y1="12" x2="9" y2="12"></line>
          <line x1="21" y1="18" x2="7" y2="18"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
          <path d="M15 2l3 3-3 3"></path>
        </svg>
        Summarize
      `;
      sumBtn.onclick = () => alert("Summarize functionality coming soon!");

      // MOM Btn
      const momBtn = document.createElement('button');
      momBtn.className = 'footer-btn btn-mom';
      momBtn.innerHTML = `
        <svg class="footer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" transform="translate(2, 2) scale(0.6)"></path> 
        </svg>
        Minutes of Meeting
      `;
      momBtn.onclick = () => alert("Minutes of Meeting functionality coming soon!");

      footer.appendChild(sumBtn);
      footer.appendChild(momBtn);
      card.appendChild(footer);

      shadow.appendChild(card);

      // Drag Logic
      let isDragging = false;
      let startX, startY, initialLeft, initialTop;

      header.addEventListener('mousedown', (e) => {
        // Don't drag if clicking toggle
        if (e.target.closest('.switch')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = host.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        // Reset to left/top positioning
        host.style.right = 'auto';
        host.style.bottom = 'auto';
        host.style.left = `${initialLeft}px`;
        host.style.top = `${initialTop}px`;
        host.style.height = `${rect.height}px`; // preserve height

        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        host.style.left = `${initialLeft + dx}px`;
        host.style.top = `${initialTop + dy}px`;
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
      });

    } else {
      shadow = host.shadowRoot;
      contentArea = shadow.querySelector('.content');
      // Update toggle state if logic demands
    }

    // --- Listeners ---
    const toggleInput = shadow.querySelector('.switch input');
    if (toggleInput) {
      toggleInput.onclick = (e) => {
        // If checked, enabled = true.
        chrome.runtime.sendMessage({ action: 'toggleAutoPoll', enabled: e.target.checked });
      };
    }

    if (data) {
      if (data.suggested_questions && data.suggested_questions.length > 0) {

        if (contentArea.classList.contains('empty')) {
          contentArea.innerHTML = '';
          contentArea.classList.remove('empty');
        }

        // 1. Identify new questions (Global Duplicate Check)
        const existingQuestions = new Set();
        contentArea.querySelectorAll('.question-text').forEach(el => existingQuestions.add(el.textContent.trim()));

        const newQuestions = data.suggested_questions
          .map(q => q.trim())
          .filter(q => q && !existingQuestions.has(q));

        if (newQuestions.length > 0) {
          // 2. Create New Batch (Always)
          const batchContainer = document.createElement('div');
          batchContainer.className = 'batch-container';
          // We don't need dataset.reason anymore for merging, but keeping it cleanly

          // Reason Header (Blue Dot + Text)
          const reasonHeader = document.createElement('div');
          reasonHeader.className = 'reason-header';

          const dot = document.createElement('div');
          dot.className = 'reason-dot';

          const text = document.createElement('span');
          text.textContent = 'Why these question'; // Default View

          // If we have a specific reason, make it interactive
          if (data.reason && data.reason.trim().length > 0) {
            const reasonText = data.reason;
            reasonHeader.style.cursor = 'pointer';
            reasonHeader.title = 'Click to show the reason';

            let showingReason = false;
            reasonHeader.onclick = () => {
              showingReason = !showingReason;
              text.textContent = showingReason ? reasonText : 'Why these question';
            };
          }

          reasonHeader.appendChild(dot);
          reasonHeader.appendChild(text);
          batchContainer.appendChild(reasonHeader);

          const targetList = document.createElement('ul');
          targetList.className = 'question-list';
          batchContainer.appendChild(targetList);

          // 3. Add Questions
          newQuestions.forEach(questionText => {
            const item = document.createElement('li');
            item.className = 'question-item';

            const body = document.createElement('div');
            body.className = 'question-body';

            const mark = document.createElement('span');
            mark.className = 'question-mark';
            mark.textContent = '?';

            const textSpan = document.createElement('span');
            textSpan.className = 'question-text';
            textSpan.textContent = questionText;

            body.appendChild(mark);
            body.appendChild(textSpan);

            const actions = document.createElement('div');
            actions.className = 'question-actions';

            const likeBtn = document.createElement('button');
            likeBtn.className = 'action-btn';
            likeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>';

            const dislikeBtn = document.createElement('button');
            dislikeBtn.className = 'action-btn';
            dislikeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>';

            actions.appendChild(likeBtn);
            actions.appendChild(dislikeBtn);

            item.appendChild(body);
            item.appendChild(actions);

            targetList.appendChild(item);
          });

          contentArea.appendChild(batchContainer);
          contentArea.scrollTop = contentArea.scrollHeight;
        }
      }
    }
  }

})();
