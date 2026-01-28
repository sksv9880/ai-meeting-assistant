document.addEventListener('DOMContentLoaded', () => {
    const webhookInput = document.getElementById('webhookInput');
    const questionsWebhookInput = document.getElementById('questionsWebhookInput');
    const toggleSessionBtn = document.getElementById('toggleSessionBtn');
    const showLogsBtn = document.getElementById('showLogsBtn');
    const agentStatus = document.getElementById('agentStatus');
    const statusText = document.getElementById('statusText');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');

    // Modal elements
    const logsModal = document.getElementById('logsModal');
    const closeLogsBtn = document.getElementById('closeLogsBtn');
    const logsContainer = document.getElementById('logsContainer');

    // Default Webhooks
    const DEFAULT_BOT_WEBHOOK = 'https://hiniyit.app.n8n.cloud/webhook/5b7b0680-b800-4cfb-aa87-a3a11902d019';
    const DEFAULT_AGENT_WEBHOOK = 'https://hiniyit.app.n8n.cloud/webhook/4d78f5e5-8d34-4af9-9bae-3505cbc41bf7';

    // Load saved settings or set defaults
    chrome.storage.local.get(['webhookUrl', 'questionsWebhookUrl', 'pollingEnabled'], (result) => {
        if (result.webhookUrl) {
            webhookInput.value = result.webhookUrl;
        } else {
            webhookInput.value = DEFAULT_BOT_WEBHOOK;
            chrome.storage.local.set({ webhookUrl: DEFAULT_BOT_WEBHOOK });
        }

        if (result.questionsWebhookUrl) {
            questionsWebhookInput.value = result.questionsWebhookUrl;
        } else {
            questionsWebhookInput.value = DEFAULT_AGENT_WEBHOOK;
            chrome.storage.local.set({ questionsWebhookUrl: DEFAULT_AGENT_WEBHOOK });
        }

        updateUI(result.pollingEnabled);
    });

    // Test Webhooks Button
    const testBtn = document.getElementById('testWebhookBtn');
    const testStatus = document.getElementById('testStatus');

    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            const botUrl = webhookInput.value.trim();
            const agentUrl = questionsWebhookInput.value.trim();

            if (!botUrl || !agentUrl) {
                showTestStatus('Please enter both URLs first', 'error');
                return;
            }

            testBtn.disabled = true;
            testBtn.textContent = 'Testing...';
            showTestStatus('', '');

            try {
                // Determine which URL to test (or both)
                // For simplicity, let's just test the Agent URL as it returns a response we can check
                // Actually, let's try a dry run fetch to the Agent URL since it expects a POST

                const response = await fetch(agentUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: 'https://test-connection.com',
                        status: 'test_connection',
                        timestamp: new Date().toISOString()
                    })
                });

                if (response.ok) {
                    showTestStatus('Connection Successful!', 'success');
                } else {
                    showTestStatus(`Error: ${response.status}`, 'error');
                }
            } catch (error) {
                showTestStatus(`Failed: ${error.message}`, 'error');
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = 'Test Connections';
            }
        });
    }

    function showTestStatus(msg, type) {
        testStatus.textContent = msg;
        testStatus.className = type;
        testStatus.classList.add('visible');
        setTimeout(() => {
            if (testStatus.className !== 'error') { // Keep errors visible longer or until next action
                testStatus.classList.remove('visible');
            }
        }, 3000);
    }

    // Toggle Settings Panel
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('open');
    });

    // Save settings when changed
    webhookInput.addEventListener('change', () => {
        chrome.storage.local.set({ webhookUrl: webhookInput.value.trim() });
    });

    questionsWebhookInput.addEventListener('change', () => {
        chrome.storage.local.set({ questionsWebhookUrl: questionsWebhookInput.value.trim() });
    });

    // Toggle Session
    toggleSessionBtn.addEventListener('click', () => {
        chrome.storage.local.get(['pollingEnabled'], (result) => {
            const isRunning = result.pollingEnabled;

            if (isRunning) {
                // Stop
                chrome.runtime.sendMessage({ action: 'stopSession' });
                updateUI(false);
            } else {
                // Start
                const botUrl = webhookInput.value.trim();
                const agentUrl = questionsWebhookInput.value.trim();

                if (!botUrl || !agentUrl) {
                    alert('Please enter both Webhook URLs.');
                    return;
                }

                // Save latest values before starting
                chrome.storage.local.set({
                    webhookUrl: botUrl,
                    questionsWebhookUrl: agentUrl
                }, () => {
                    chrome.runtime.sendMessage({ action: 'startSession' });
                    updateUI(true);
                });
            }
        });
    });

    // Show Logs
    showLogsBtn.addEventListener('click', () => {
        chrome.storage.local.get(['logs'], (result) => {
            const logs = result.logs || [];
            logsContainer.innerHTML = logs.length > 0
                ? logs.map(log => `<div class="log-entry"><span class="log-time">${log.substring(1, 9)}</span>${escapeHtml(log.substring(11))}</div>`).join('')
                : '<div class="log-entry">No logs found.</div>';
            logsModal.classList.add('show');
        });
    });

    // Close Logs
    closeLogsBtn.addEventListener('click', () => {
        logsModal.classList.remove('show');
    });

    // Close modal on click outside
    logsModal.addEventListener('click', (e) => {
        if (e.target === logsModal) {
            logsModal.classList.remove('show');
        }
    });

    function updateUI(isRunning) {
        const statusIndicator = document.getElementById('statusIndicator');
        if (isRunning) {
            toggleSessionBtn.textContent = 'Stop Session';
            toggleSessionBtn.classList.add('btn-stop');
            toggleSessionBtn.classList.remove('btn-primary');
            statusIndicator.classList.add('running');
            agentStatus.style.backgroundColor = '#4CAF50';
            statusText.textContent = 'Active';
        } else {
            toggleSessionBtn.textContent = 'Start Session';
            toggleSessionBtn.classList.add('btn-primary');
            toggleSessionBtn.classList.remove('btn-stop');
            statusIndicator.classList.remove('running');
            agentStatus.style.backgroundColor = '#ccc';
            statusText.textContent = 'Ready';
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
