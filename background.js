const ALARM_NAME = 'pollQuestions';
const POLLING_INTERVAL_MINUTES = 0.17; // 2 seconds (CRITICAL for low latency)
let agentRunning = false;

// Initialize state on every service worker wakeup
// (e.g. when extension is loaded or background restarts)
checkPollingStatus();

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed.');
    checkPollingStatus();
});

// Navigation Listener: Inject Dashboard if running
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    chrome.storage.local.get(['targetTabId'], (result) => {
        if (agentRunning && changeInfo.status === 'complete' && isValidTab(tab) && tabId === result.targetTabId) {
            injectDashboard(tabId);
        }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startSession') {
        startSession();
        sendResponse({ status: 'starting' });
    } else if (message.action === 'stopSession') {
        stopSession();
        sendResponse({ status: 'stopped' });
    } else if (message.action === 'toggleAutoPoll') {
        const enabled = message.enabled;
        chrome.storage.local.set({ autoPolling: enabled }, () => {
            logToStorage(`Auto-poll toggled: ${enabled}`);
            ensureAlarm(); // Will create or clear based on state

            // Send status update immediately
            const status = enabled ? 'resume_bot' : 'pause_bot';
            fetchQuestions(true, status).catch(err => {
                logToStorage(`Status update failed: ${err.message}`);
            });
        });
    } else if (message.action === 'pollNow') {
        logToStorage('Manual poll initiated.');
        fetchQuestions(true, 'auto_poll').then(() => {
            sendResponse({ status: 'completed' });
        }).catch((err) => {
            sendResponse({ status: 'error', message: err.message });
        });
        return true; // Keep the message channel open for async response
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        logToStorage('Alarm fired. Fetching questions...');
        fetchQuestions(false, 'auto_poll').catch(err => {
            logToStorage(`Auto-poll failed: ${err.message}`);
        });
    }
});

function isValidTab(tab) {
    return tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'));
}

function checkPollingStatus() {
    chrome.storage.local.get(['pollingEnabled'], (result) => {
        if (result.pollingEnabled && result.targetTabId) {
            // If it was running, we just resume polling. 
            // We assume targetUrl is already set.
            agentRunning = true;
            ensureAlarm();
        } else {
            agentRunning = false;
        }
    });
}

function ensureAlarm() {
    chrome.storage.local.get(['autoPolling'], (result) => {
        const isAuto = result.autoPolling !== false; // Default true if undefined
        if (isAuto) {
            chrome.alarms.get(ALARM_NAME, (alarm) => {
                if (!alarm || alarm.periodInMinutes !== POLLING_INTERVAL_MINUTES) {
                    chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLLING_INTERVAL_MINUTES });
                    logToStorage(`Polling alarm updated (Interval: ${POLLING_INTERVAL_MINUTES} min).`);
                }
            });
        } else {
            chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
                logToStorage(`Polling alarm cleared (Auto-poll OFF). Was cleared: ${wasCleared}`);
            });
        }
    });
}

async function startSession() {
    // 1. Get Webhooks
    const { webhookUrl, questionsWebhookUrl } = await chrome.storage.local.get(['webhookUrl', 'questionsWebhookUrl']);

    if (!webhookUrl || !questionsWebhookUrl) {
        logToStorage('Error: Both Bot and Agent webhooks are required.');
        return;
    }

    // 2. Capture URL
    // 1: Get Tab ID
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs && tabs.length > 0 && isValidTab(tabs[0])) {
            const targetUrl = tabs[0].url;
            const targetTabId = tabs[0].id;

            // Save state
            await chrome.storage.local.set({
                targetUrl: targetUrl,
                targetTabId: targetTabId,
                pollingEnabled: true,
                autoPolling: true // Default to true on start
            });

            agentRunning = true;
            logToStorage(`Session started. Target: ${targetUrl} (Tab ID: ${targetTabId})`);

            // 3. Send to Bot Webhook (Fire & Forget)
            logToStorage('Triggering Bot...');
            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: targetUrl, timestamp: new Date().toISOString() })
            })
                .then(res => {
                    if (res.ok) logToStorage('Bot triggered successfully.');
                    else logToStorage(`Bot trigger failed: ${res.status}`);
                })
                .catch(err => logToStorage(`Bot trigger error: ${err.message}`));

            // 4. Start Polling (Agent)
            ensureAlarm();

            // Inject Dashboard
            injectDashboard(targetTabId);

            // Initial Poll
            fetchQuestions(true, 'auto_poll'); // Treat initial poll as manual to ensure it runs even if alarm logic is pending

        } else {
            logToStorage('Failed to capture valid URL. Session not started.');
        }
    });
}

function stopSession() {
    agentRunning = false;
    chrome.alarms.clear(ALARM_NAME);

    // Retrieve data to send stop signal and clean up
    chrome.storage.local.get(['targetTabId', 'targetUrl', 'questionsWebhookUrl'], (result) => {
        const { targetTabId, targetUrl, questionsWebhookUrl } = result;

        // Send stop signal to n8n
        if (questionsWebhookUrl && targetUrl) {
            logToStorage('Sending stop signal to n8n...');
            fetch(questionsWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: targetUrl,
                    status: 'session_stopped',
                    timestamp: new Date().toISOString()
                })
            }).then(() => logToStorage('Stop signal sent.'))
                .catch(err => logToStorage(`Failed to send stop signal: ${err.message}`));
        }

        chrome.storage.local.set({ pollingEnabled: false });
        chrome.storage.local.remove(['targetUrl', 'targetTabId']);
        logToStorage('Session stopped.');

        if (targetTabId) {
            // 1. Try polite message to specific tab
            chrome.tabs.sendMessage(targetTabId, { action: 'hideDashboard' }).catch(() => { });

            // 2. Force remove via scripting
            chrome.scripting.executeScript({
                target: { tabId: targetTabId },
                func: () => {
                    const el = document.getElementById('chrome-url-sender-floating-host');
                    if (el) el.remove();
                }
            }).catch(() => { });
        }
    });
}

function injectDashboard(tabId, data = null) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
    }, () => {
        if (chrome.runtime.lastError) {
            // Ignore errors for tabs we can't access (like chrome://)
            // console.warn(`Could not inject script into tab ${tabId}:`, chrome.runtime.lastError.message);
            return;
        }

        // Retrieve autoPolling state to sync UI
        chrome.storage.local.get(['autoPolling'], (result) => {
            const isAuto = result.autoPolling !== false;

            // After injection, tell it to show the dashboard
            setTimeout(() => {
                // If we have specific data (from a retry), show that. Otherwise just show dashboard.
                if (data) {
                    chrome.tabs.sendMessage(tabId, { action: 'showQuestions', data: data, autoPolling: isAuto }).catch(() => { });
                } else {
                    chrome.tabs.sendMessage(tabId, { action: 'showDashboard', autoPolling: isAuto }).catch(() => { });
                }
            }, 200);
        });
    });
}

function logToStorage(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMsg = `[${timestamp}] ${message}`;
    console.log(logMsg);

    chrome.storage.local.get(['logs'], (result) => {
        let logs = result.logs || [];
        logs.unshift(logMsg); // Add to top
        if (logs.length > 50) {
            logs = logs.slice(0, 50); // Keep last 50
        }
        chrome.storage.local.set({ logs: logs, lastLog: logMsg });
    });
}

async function fetchQuestions(isManual = false, status = 'auto_poll') {
    const { questionsWebhookUrl, targetUrl, autoPolling } = await chrome.storage.local.get(['questionsWebhookUrl', 'targetUrl', 'autoPolling']);

    // Check if auto-polling is disabled
    if (!isManual && autoPolling === false) {
        // Guard against race conditions where alarm fires after toggle off
        logToStorage('Skipping fetch (Auto-poll disabled).');
        return;
    }

    if (!questionsWebhookUrl) {
        logToStorage('No webhook URL configured.');
        return;
    }

    if (!targetUrl) {
        logToStorage('No target URL found. Please restart the agent.');
        return;
    }

    try {
        logToStorage(`Fetching questions for: ${targetUrl}`);
        const response = await fetch(questionsWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                status: status,
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error(`Network error: ${response.status}`);
        }

        const text = await response.text();
        if (!text || !text.trim()) {
            logToStorage('Received empty response from server.');
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            logToStorage(`JSON Parse Error: ${e.message}`);
            return;
        }

        // Debug: Log the raw data type and content (truncated)
        const dataStr = JSON.stringify(data).substring(0, 100);
        logToStorage(`Raw: ${dataStr}...`);

        let latestItem = null;
        if (Array.isArray(data) && data.length > 0) {
            latestItem = data[0];
        } else if (data && typeof data === 'object' && !Array.isArray(data)) {
            latestItem = data;
        }

        if (latestItem && latestItem.suggested_questions && latestItem.suggested_questions.length > 0) {
            const qCount = latestItem.suggested_questions.length;
            logToStorage(`Received ${qCount} questions.`);

            // Send only to the target tab
            chrome.storage.local.get(['targetTabId', 'autoPolling'], (result) => {
                const targetTabId = result.targetTabId;
                // Re-read autoPolling here to ensure we have the LATEST state (e.g. if user toggled while fetch was in flight)
                const isAuto = result.autoPolling !== false;

                if (targetTabId) {
                    chrome.tabs.sendMessage(targetTabId, {
                        action: 'showQuestions',
                        data: latestItem,
                        autoPolling: isAuto
                    })
                        .catch((err) => {
                            console.warn(`Failed to send to tab ${targetTabId}: ${err.message}`);
                            // Try to re-inject and send again
                            injectDashboard(targetTabId, latestItem);
                        });
                }
            });

        } else {
            logToStorage('No questions found in data.');
            // Send empty state only to target tab
            chrome.storage.local.get(['targetTabId', 'autoPolling'], (result) => {
                const targetTabId = result.targetTabId;
                // Re-read autoPolling here too
                const isAuto = result.autoPolling !== false;

                if (targetTabId) {
                    chrome.tabs.sendMessage(targetTabId, {
                        action: 'showQuestions',
                        data: { suggested_questions: [] },
                        autoPolling: isAuto
                    }).catch(() => { });
                }
            });
        }
    } catch (error) {
        logToStorage(`Error: ${error.message}`);
        throw error; // Re-throw for manual poll promise
    }
}
