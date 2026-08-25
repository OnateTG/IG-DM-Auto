class BackgroundManager {
  constructor() {
    this.campaigns = new Map();
    this.activeUsers = new Set();
    // Google Apps Script Web App URL for Remote Self-Healing
    this.GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzjmki0wc_TFbNybVL_80vVebL_5ietYvlKvAAFNNPfMN3-yVDbRX9F5u_ZtSQSP7bRKA/exec'; 
    this.init();
  }

  init() {
    // Listen for extension installation
    chrome.runtime.onInstalled.addListener(() => {
      console.log('📦 Instagram DM Automation installed successfully');
    });

    // Handle action clicks (open in new tab instead of popup)
    console.log('🔧 Setting up extension icon click handler...');
    chrome.action.onClicked.addListener(async (tab) => {
      console.log('🖱️ Extension icon clicked, opening dashboard...');
      console.log('📍 Current tab:', tab.url);
      try {
        if (typeof this.openDashboard === 'function') {
           await this.openDashboard();
        } else {
           console.error('❌ FATAL: openDashboard is not a function on this instance!');
           // Emergency fallback
           const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
           chrome.tabs.create({ url: dashboardUrl });
        }
      } catch (err) {
        console.error('❌ Error invoking openDashboard:', err);
      }
    });

    // Handle messages from content script and dashboard
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      let responded = false;
      
      const timeoutId = setTimeout(() => {
        if (!responded) {
          responded = true;
          try { sendResponse({ success: false, error: 'Response timeout' }); } catch (e) {}
        }
      }, 15000);
      
      const respond = (data) => {
        if (!responded) {
          responded = true;
          clearTimeout(timeoutId);
          try { sendResponse(data); } catch (e) {}
        }
      };
      
      // Wrapper: replace sendResponse with our guarded version
      // Await the handler to ensure response is sent before channel closes
      (async () => {
        try {
          await this.handleMessage(message, sender, respond);
        } catch (err) {
          console.error('Background message handler error:', err);
          respond({ success: false, error: err.message || 'Unknown error' });
        }
      })();
      
      return true; // Keep message channel open for async response
    });

    // Debounce timer for session checks
    let sessionCheckDebounce = null;

    // Handle tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // Only check on navigation to Instagram, not every update
      if (changeInfo.url && tab.url?.includes('instagram.com')) {
        clearTimeout(sessionCheckDebounce);
        sessionCheckDebounce = setTimeout(() => {
          this.checkInstagramSession(tabId);
        }, 2000);
      }
    });
    
    // Handle tab closure during campaign
    chrome.tabs.onRemoved.addListener((tabId) => {
      for (const [campaignId, campaign] of this.campaigns) {
        if (campaign.tabId === tabId && campaign.status === 'active') {
          console.log(`📴 Instagram tab closed during campaign ${campaignId}, pausing...`);
          campaign.status = 'paused';
          campaign.lastUpdated = Date.now();
          this.updateCampaignStatus(campaignId, 'paused');
          this.campaigns.set(campaignId, campaign);
        }
      }
    });
    
    this.log('✅ Background script initialized successfully');
    
    // Check for interrupted campaigns after a short delay to allow tabs to load
    setTimeout(() => this.resumeActiveCampaigns(), 3000);
    
    // Periodic check for daily limit resets (every hour)
    setInterval(() => this.checkDailyLimitResets(), 3600000);
  }

  async openDashboard() {
    console.log('🚀 openDashboard method called');
    // Open the options page which is our dashboard
    try {
      console.log('Attempting to open options page...');
      await chrome.runtime.openOptionsPage();
      console.log('✅ Options page opened command sent');
    } catch (error) {
      console.error('Error opening dashboard:', error);
      // Fallback: try to open directly
      try {
        console.log('⚠️ Options page failed, trying direct tab creation...');
        const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
        await chrome.tabs.create({ 
          url: dashboardUrl,
          active: true 
        });
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }
  }

  async log(message, type = 'info') {
const logEntry = {
        timestamp: Date.now(),
        source: 'Extension',
        type,
        message
      };
    console.log(`[${type.toUpperCase()}] ${message}`);
    await this.saveLog(logEntry);
  }

  async saveLog(logEntry) {
    try {
      const data = await chrome.storage.local.get('debug_logs');
      const logs = data.debug_logs || [];
      logs.unshift(logEntry); // Add to beginning
      
      // Keep last 1000 logs
      if (logs.length > 1000) {
        logs.length = 1000;
      }
      
      await chrome.storage.local.set({ debug_logs: logs });
    } catch (error) {
      console.error('Error saving log:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'CHECK_AUTH':
          const authStatus = await this.checkAuthentication();
          sendResponse({ success: true, authenticated: authStatus.isLoggedIn, username: authStatus.username });
          break;

        case 'LOG_DEBUG':
          await this.saveLog({
            timestamp: Date.now(),
            source: message.source || 'Instagram Page',
            type: message.level || 'info',
            message: message.message
          });
          sendResponse({ success: true });
          break;

        case 'GET_LOGS':
          const data = await chrome.storage.local.get('debug_logs');
          sendResponse({ success: true, logs: data.debug_logs || [] });
          break;

        case 'CLEAR_LOGS':
          if (message.keepLogs) {
            await chrome.storage.local.set({ debug_logs: message.keepLogs });
          } else {
            await chrome.storage.local.set({ debug_logs: [] });
          }
          sendResponse({ success: true });
          break;

        case 'START_CAMPAIGN':
          const result = await this.startCampaign(message.data);
          sendResponse(result);
          break;

        case 'STOP_CAMPAIGN':
          const stopResult = await this.stopCampaign(message.campaignId);
          sendResponse(stopResult);
          break;

        case 'PAUSE_CAMPAIGN':
          const pauseResult = await this.togglePauseCampaign(message.campaignId, message.paused);
          sendResponse(pauseResult);
          break;

        case 'GET_CAMPAIGNS':
          try {
            const campaigns = Array.from(this.campaigns.values()).map(c => ({
              id: c.id,
              status: c.status,
              name: c.name,
              currentIndex: c.currentIndex,
              totalLeads: c.originalLeadCount || c.leads?.length || 0
            }));
            sendResponse({ success: true, campaigns });
          } catch (e) {
            console.error('GET_CAMPAIGNS error:', e);
            sendResponse({ success: false, campaigns: [], error: e.message });
          }
          break;

        case 'GET_STATS':
          const stats = await this.getCampaignStats(message.campaignId);
          sendResponse({ success: true, stats });
          break;

        case 'GET_DETAILED_STATS':
          const detailedStats = await this.getDetailedCampaignStats(message.campaignId);
          sendResponse({ success: true, stats: detailedStats });
          break;

        case 'DOWNLOAD_REPORT':
          const reportData = await this.generateCampaignReport(message.campaignId);
          sendResponse({ success: true, data: reportData });
          break;

        case 'SAVE_LEADS':
          const saveResult = await this.saveLeads(message.leads);
          sendResponse(saveResult);
          break;

        case 'DELAY_REQUEST':
          await this.sleep(message.duration);
          sendResponse({ success: true });
          break;

        case 'FETCH_REMOTE_CONFIG':
          console.log('🌍 Fetching remote config from GAS...');
          let remoteError = null;
          let remoteResponse = null;
          let gasUrl = null;

          try {
            // Retrieve dynamic URL from settings
            const storedData = await chrome.storage.local.get('settings');
            gasUrl = storedData.settings?.remoteHealingUrl;

            if (!gasUrl) {
              throw new Error("Remote Healing URL is not configured in Settings.");
            }
          } catch (setupErr) {
            console.error('Remote config setup failed:', setupErr);
            sendResponse({ success: false, error: 'Remote Healing URL not configured. Go to Settings → Remote Self-Healing.' });
            break;
          }

          // Attempt 3 times with exponential backoff
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              console.log(`🌍 Fetch attempt ${attempt}/3...`);
              const response = await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html: message.html })
              });

              if (!response.ok) {
                if (response.status === 429) {
                  console.warn(`⚠️ Rate limited (429) on attempt ${attempt}`);
                  // Exponential backoff: 2^attempt seconds
                  const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                  console.log(`⏳ Backing off for ${backoffMs}ms...`);
                  await this.sleep(backoffMs);
                  continue; // retry
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }

              const data = await response.json();
              if (data.success && data.config) {
                remoteResponse = data;
                break; // success
              } else {
                throw new Error(data.error || 'GAS returned empty config');
              }
            } catch (attemptErr) {
              remoteError = attemptErr;
              console.error(`Fetch attempt ${attempt} failed:`, attemptErr.message);
              if (attempt < 3) {
                const backoffMs = Math.pow(2, attempt) * 1000;
                await this.sleep(backoffMs);
              }
            }
          }

          if (remoteResponse && remoteResponse.success) {
            sendResponse(remoteResponse);
          } else {
            console.error('❌ All 3 GAS attempts failed:', remoteError?.message);
            sendResponse({ success: false, error: remoteError?.message || 'All GAS attempts failed. Please check your Remote Healing URL or retry later.' });
          }
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

async resumeActiveCampaigns() {
    console.log('🔄 Checking for interrupted campaigns...');
    try {
      const data = await chrome.storage.local.get(null);
      const campaignKeys = Object.keys(data).filter(k => k.startsWith('campaign_'));
      
      for (const key of campaignKeys) {
        const campaign = data[key];
        const resumeable = ['active', 'paused', 'paused_daily_limit'];
        if (resumeable.includes(campaign.status) && !this.campaigns.has(campaign.id)) {
          console.log(`🚀 Resuming campaign ${campaign.id} from index ${campaign.currentIndex}`);
          
          // Verify we have a valid Instagram tab
          const tab = await this.findInstagramTab();
          if (!tab) {
            console.log('⚠️ Cannot resume campaign: No Instagram tab found');
            // Mark as paused waiting for tab
            campaign.status = 'paused';
            campaign.lastUpdated = Date.now();
            await chrome.storage.local.set({ [key]: campaign });
            continue;
          }
          
          // Verify tab access
          const canAccess = await this.canAccessTab(tab.id);
          if (!canAccess) {
            console.log('⚠️ Cannot access Instagram tab, permission needed');
            campaign.status = 'paused';
            campaign.lastUpdated = Date.now();
            await chrome.storage.local.set({ [key]: campaign });
            continue;
          }
          
          // Build complete campaign object with defaults
          const fullCampaign = {
            tabId: tab.id,
            status: 'active',
            currentIndex: campaign.currentIndex || 0,
            name: campaign.name || 'Resumed Campaign',
            leads: campaign.leads || [],
            settings: campaign.settings || {},
            stats: campaign.stats || {
              processed: 0, followed: 0, messaged: 0, errors: 0,
              skipped: 0, successful: 0, failedFollows: 0, failedMessages: 0
            },
            performance: campaign.performance || { successRate: 0, followSuccessRate: 0, messageSuccessRate: 0 },
            dailyActions: campaign.dailyActions || {},
            createdAt: campaign.createdAt || Date.now(),
            startedAt: campaign.startedAt || Date.now(),
            lastUpdated: Date.now(),
            // Preserve additional fields
            errorLog: campaign.errorLog || [],
            detailedResults: campaign.detailedResults || [],
            originalLeadCount: campaign.originalLeadCount || campaign.leads?.length || 0,
            completedAt: campaign.completedAt,
            stoppedAt: campaign.stoppedAt
          };
          
          this.campaigns.set(campaign.id, fullCampaign);
          
          // Update storage with active status and new tabId
          fullCampaign.status = 'active';
          await chrome.storage.local.set({
            [`campaign_${campaign.id}`]: fullCampaign,
            currentCampaign: campaign.id
          });
          
          // Resume execution
          this.executeCampaign(campaign.id);
        }
      }
    } catch (error) {
      console.error('Error resuming campaigns:', error);
    }
  }

  async notifyCampaignCompleted(campaignId) {
    // Send message to dashboard if open
    try {
      chrome.runtime.sendMessage({
        type: 'CAMPAIGN_COMPLETED',
        campaignId: campaignId
      }).catch(() => {}); // Ignore if no listeners
    } catch (e) {
      // Ignore
    }
  }

   async findInstagramTab() {
     // 1. Try active tab first (permission granted by activeTab)
     try {
       const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
       if (activeTab?.url) {
         const url = new URL(activeTab.url);
         if (url.hostname === 'www.instagram.com' || url.hostname === 'instagram.com') {
           console.log('Using active Instagram tab:', activeTab.id);
           return activeTab;
         }
       }
     } catch (e) {
       console.log('Active tab check failed:', e.message);
     }
     
     // 2. Try URL-based query (requires host permission)
     try {
       const tabs = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
       if (tabs.length > 0) {
         console.log('Found Instagram tab via URL query:', tabs[0].id);
         return tabs[0];
       }
     } catch (e) {
       console.log('URL tab query failed:', e.message);
     }
     
     // 3. Brute-force scan all tabs (fallback for permission issues)
     try {
       const tabs = await chrome.tabs.query({});
       for (const tab of tabs) {
         if (tab.url) {
           try {
             const url = new URL(tab.url);
             if (url.hostname === 'www.instagram.com' || url.hostname === 'instagram.com') {
               console.log('Found Instagram tab via brute-force scan:', tab.id);
               return tab;
             }
           } catch {
             continue;
           }
         }
       }
     } catch (e) {
       console.log('Brute-force scan failed:', e.message);
     }
     
     console.log('No Instagram tab found');
     return null;
   }

   async hasInstagramPermission() {
     try {
       const granted = await chrome.permissions.contains({
         origins: ['https://www.instagram.com/*']
       });
       return granted;
     } catch (e) {
       return false;
     }
   }

   async requestInstagramPermission() {
     try {
       const granted = await chrome.permissions.request({
         origins: ['https://www.instagram.com/*']
       });
       console.log('Instagram permission request result:', granted);
       return granted;
     } catch (e) {
       console.error('Permission request failed:', e);
       return false;
     }
   }

   async canAccessTab(tabId) {
     try {
       // Try a harmless operation to verify access
       const tab = await chrome.tabs.get(tabId);
       return true;
     } catch (error) {
       console.log('Cannot access tab', tabId, ':', error.message);
       return false;
     }
   }

async checkAuthentication() {
    try {
      const tab = await this.findInstagramTab();
      
      if (!tab) {
        console.log('No Instagram tab found');
        return { isLoggedIn: false, username: null, error: 'No Instagram tab open' };
      }

      console.log('Checking auth on tab:', tab.id);
      
      // Verify tab is still on Instagram before executing script
      try {
        const updatedTab = await chrome.tabs.get(tab.id);
        if (!updatedTab?.url || !updatedTab.url.includes('instagram.com')) {
          console.log('Tab is no longer on Instagram, skipping auth check');
          return { isLoggedIn: false, username: null, error: 'Tab not on Instagram' };
        }
      } catch (e) {
        console.log('Tab no longer accessible:', e.message);
        return { isLoggedIn: false, username: null, error: 'Tab not accessible' };
      }
      
      // Before executing script, verify we have permission for this tab
      try {
        const canAccess = await this.canAccessTab(tab.id);
        if (!canAccess) {
          return { 
            isLoggedIn: false, 
            username: null, 
            error: 'Permission required. Please click the extension icon while on Instagram to grant access.' 
          };
        }
      } catch (permError) {
        console.log('Permission check failed, continuing anyway:', permError.message);
      }
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function() {
          console.log('Auth check script executing...');
          
          // Enhanced authentication detection with multiple fallback methods
          let loggedInUsername = null;
          let isLoggedIn = false;
          
          // Wait a moment for page to fully load
          const waitForLoad = () => {
            return new Promise(resolve => {
              if (document.readyState === 'complete') {
                setTimeout(resolve, 1000); // Extra wait for dynamic content
              } else {
                window.addEventListener('load', () => setTimeout(resolve, 1000));
              }
            });
          };
          
          const detectUsername = async () => {
            await waitForLoad();
            
            // Method 1: Check for main navigation profile link with image
            const navProfileLinks = document.querySelectorAll('nav a, [role="navigation"] a');
            for (const link of navProfileLinks) {
              const href = link.getAttribute('href');
              if (href && href.match(/^\/[a-zA-Z0-9._]{1,30}\/?$/)) {
                // Check if this link has a profile image
                const profileImg = link.querySelector('img[alt*="profile"], img[alt*="Profile"], img[style*="border-radius"]');
                if (profileImg) {
                  const username = href.replace(/\//g, '');
                  if (username && username !== 'explore' && username !== 'reels') {
                    loggedInUsername = username;
                    isLoggedIn = true;
                    console.log('Method 1 - Found nav profile:', loggedInUsername);
                    return { loggedInUsername, isLoggedIn };
                  }
                }
              }
            }
            
            // Method 2: Look for the user's own profile in sidebar/navigation
            const sidebarLinks = document.querySelectorAll('[role="navigation"] a, aside a, div[role="main"] nav a');
            for (const link of sidebarLinks) {
              const href = link.getAttribute('href');
              const text = link.textContent?.toLowerCase();
              
              if (href && href.match(/^\/[a-zA-Z0-9._]{1,30}\/?$/) && 
                  (text?.includes('profile') || link.querySelector('img[alt*="profile"]'))) {
                const username = href.replace(/\//g, '');
                if (username && username.length > 0 && username !== 'explore') {
                  loggedInUsername = username;
                  isLoggedIn = true;
                  console.log('Method 2 - Found sidebar profile:', loggedInUsername);
                  return { loggedInUsername, isLoggedIn };
                }
              }
            }
            
            // Method 3: Check current URL if on profile page with edit indicators
            const currentPath = window.location.pathname;
            if (currentPath.match(/^\/[a-zA-Z0-9._]{1,30}\/?$/)) {
              const potentialUsername = currentPath.replace(/\//g, '');
              
              // Look for indicators this is the user's own profile
              const editIndicators = [
                document.querySelector('[data-testid*="edit"]'),
                document.querySelector('button[aria-label*="Edit"]'),
                document.querySelector('a[href*="/accounts/edit/"]'),
                document.querySelector('button[aria-label*="Options"]'),
                document.querySelector('[aria-label*="Profile options"]')
              ].filter(Boolean);
              
              if (editIndicators.length > 0 && potentialUsername) {
                loggedInUsername = potentialUsername;
                isLoggedIn = true;
                console.log('Method 3 - Found own profile page:', loggedInUsername);
                return { loggedInUsername, isLoggedIn };
              }
            }
            
            // Method 4: Check meta tags and page data
            const metaElements = document.querySelectorAll('meta[property="al:ios:url"], meta[property="og:url"]');
            for (const meta of metaElements) {
              const content = meta.getAttribute('content');
              const match = content?.match(/instagram\.com\/([a-zA-Z0-9._]{1,30})\/?/);
              if (match) {
                const username = match[1];
                // Only use if we also see edit profile elements
                const hasEditElements = document.querySelector('[data-testid*="edit"], button[aria-label*="Edit"]');
                if (hasEditElements) {
                  loggedInUsername = username;
                  isLoggedIn = true;
                  console.log('Method 4 - Found meta username:', loggedInUsername);
                  return { loggedInUsername, isLoggedIn };
                }
              }
            }
            
            // Method 5: Look in script tags for user data
            const scriptTags = document.querySelectorAll('script');
            for (const script of scriptTags) {
              const content = script.textContent || script.innerHTML;
              if (content && content.includes('username')) {
                // Look for patterns like "username":"actual_username"
                const userMatches = content.match(/"username":"([a-zA-Z0-9._]{1,30})"/g);
                if (userMatches) {
                  // Take the first reasonable username found
                  for (const match of userMatches) {
                    const username = match.match(/"username":"([a-zA-Z0-9._]{1,30})"/)[1];
                    if (username && username !== 'instagram' && !username.startsWith('_')) {
                      // Additional validation - check if this appears to be the main user
                      const contextCheck = content.substring(
                        Math.max(0, content.indexOf(match) - 100),
                        content.indexOf(match) + 200
                      );
                      
                      if (contextCheck.includes('viewer') || contextCheck.includes('me') || 
                          contextCheck.includes('self') || contextCheck.includes('owner')) {
                        loggedInUsername = username;
                        isLoggedIn = true;
                        console.log('Method 5 - Found script username:', loggedInUsername);
                        return { loggedInUsername, isLoggedIn };
                      }
                    }
                  }
                }
              }
            }
            
            // Method 6: Check for logged-in indicators without username
            const loginIndicators = [
              document.querySelector('[data-testid="user-avatar"]'),
              document.querySelector('img[alt*="profile picture"]'),
              document.querySelector('input[placeholder*="Search"], [placeholder*="search"]'),
              document.querySelector('nav [role="button"]'),
              document.querySelector('[aria-label*="Home"]'),
              !document.querySelector('input[name="username"]'), // No login form
              !document.querySelector('button[type="submit"]:contains("Log in")'),
              document.querySelector('[data-testid*="home"], [aria-label*="Home"]')
            ];
            
            const positiveIndicators = loginIndicators.filter(Boolean).length;
            
            if (positiveIndicators >= 3) {
              isLoggedIn = true;
              console.log('Method 6 - Login detected without username');
            }
            
            return { loggedInUsername, isLoggedIn };
          };
          
          return detectUsername().then(result => {
            console.log('Final auth result:', result);
            
            return {
              isLoggedIn: result.isLoggedIn,
              username: result.loggedInUsername,
              url: window.location.href,
              title: document.title,
              debug: {
                hasNav: !!document.querySelector('nav'),
                hasSearchBar: !!document.querySelector('input[placeholder*="Search"]'),
                hasLoginForm: !!document.querySelector('input[name="username"]'),
                profileLinks: Array.from(document.querySelectorAll('a[href^="/"][href$="/"]')).slice(0, 5).map(a => a.href),
                currentPath: window.location.pathname
              }
            };
          }).catch(error => {
            console.error('Auth detection error:', error);
            return {
              isLoggedIn: false,
              username: null,
              url: window.location.href,
              title: document.title,
              error: error.message,
              debug: {
                hasNav: !!document.querySelector('nav'),
                hasSearchBar: !!document.querySelector('input[placeholder*="Search"]'),
                hasLoginForm: !!document.querySelector('input[name="username"]'),
                profileLinks: [],
                currentPath: window.location.pathname
              }
            };
          });
        }
      });
      
      const result = results[0]?.result;
      console.log('Auth check result:', result);
      
      if (!result) {
        return { isLoggedIn: false, username: null, error: 'Failed to execute auth check' };
      }
      
      // If we got a result but username is still null, try once more with different approach
      if (result.isLoggedIn && !result.username) {
        console.log('Retrying username detection...');
        
        try {
          const retryResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: function() {
              // Simplified retry focused on getting ANY valid username
              
              // Check all links for profile patterns
              const allLinks = document.querySelectorAll('a[href*="/"]');
              const userLinks = [];
              
              for (const link of allLinks) {
                const href = link.getAttribute('href');
                const match = href?.match(/\/([a-zA-Z0-9._]{1,30})\/?$/);
                if (match) {
                  const username = match[1];
                  if (username && 
                      username !== 'explore' && 
                      username !== 'reels' && 
                      username !== 'accounts' &&
                      !username.startsWith('p/')) {
                    userLinks.push(username);
                  }
                }
              }
              
              // Return the most likely username (shortest reasonable one, often the user's own)
              const likelyUsername = userLinks
                .filter(u => u.length >= 3 && u.length <= 20)
                .sort((a, b) => a.length - b.length)[0];
              
              return {
                username: likelyUsername,
                foundLinks: userLinks.slice(0, 5),
                method: 'retry_scan'
              };
            }
          });
          
          const retryResult = retryResults[0]?.result;
          if (retryResult?.username) {
            result.username = retryResult.username;
            console.log('Retry found username:', retryResult.username);
          }
        } catch (retryError) {
          console.error('Retry username detection failed:', retryError);
        }
      }
      
      return result;
      
    } catch (error) {
      console.error('Auth check error:', error);
      return { isLoggedIn: false, username: null, error: error.message };
    }
  }

  async stopCampaign(campaignId) {
    console.log(`🛑 Stopping campaign ${campaignId}`);
    
    try {
      // Check memory first
      let campaign = this.campaigns.get(campaignId);
      
      if (!campaign) {
        // Try loading from storage
        const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
        if (stored && stored[`campaign_${campaignId}`]) {
          campaign = stored[`campaign_${campaignId}`];
        }
      }
      
      if (campaign) {
        // Update status in memory and storage
        campaign.status = 'stopped';
        campaign.completedAt = Date.now();
        campaign.stoppedAt = Date.now();
        
        // Update memory
        this.campaigns.set(campaignId, campaign);
        
        // Update storage
        await chrome.storage.local.set({
          [`campaign_${campaignId}`]: campaign
        });
        
        // Clean up old campaign record after a delay to allow stats to be displayed
        setTimeout(() => {
          this.campaigns.delete(campaignId);
        }, 10000);
        
        // Notify all connected clients
        chrome.runtime.sendMessage({ type: 'CAMPAIGN_STOPPED', campaignId: campaignId }).catch(() => {});
        
        console.log(`✅ Campaign ${campaignId} stopped successfully`);
        return { success: true, message: 'Campaign stopped' };
      } else {
        console.warn(`Campaign ${campaignId} not found in memory or storage`);
        return { success: false, error: 'Campaign not found' };
      }
    } catch (error) {
      console.error(`❌ Error stopping campaign ${campaignId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async togglePauseCampaign(campaignId, paused) {
    console.log(`${paused ? '⏸️ Pausing' : '▶️ Resuming'} campaign ${campaignId}`);
    
    try {
      let campaign = this.campaigns.get(campaignId);
      if (!campaign) {
        const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
        if (stored && stored[`campaign_${campaignId}`]) {
          campaign = stored[`campaign_${campaignId}`];
        }
      }
      
      if (campaign) {
        campaign.status = paused ? 'paused' : 'active';
        campaign.lastUpdated = Date.now();
        
        // Update in memory
        this.campaigns.set(campaignId, campaign);
        
        // Update in storage
        await chrome.storage.local.set({
          [`campaign_${campaignId}`]: campaign
        });
        
        // Notify dashboard
        try {
          chrome.runtime.sendMessage({
            type: 'CAMPAIGN_PAUSED',
            campaignId: campaignId,
            paused: paused
          });
        } catch (e) {
          console.log('Dashboard not available:', e.message);
        }
        
        console.log(`✅ Campaign ${campaignId} ${paused ? 'paused' : 'resumed'}`);
        return { success: true, message: paused ? 'Campaign paused' : 'Campaign resumed' };
      } else {
        console.warn(`Campaign ${campaignId} not found`);
        return { success: false, error: 'Campaign not found' };
      }
    } catch (error) {
      console.error(`❌ Error toggling pause for campaign ${campaignId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async startCampaign(campaignData) {
    try {
      const tab = await this.findInstagramTab();
      
       if (!tab) {
         return { success: false, error: 'No Instagram tab found. Please open Instagram.com first.' };
       }

       // Verify permission before proceeding
       const canAccess = await this.canAccessTab(tab.id);
       if (!canAccess) {
         return { 
           success: false, 
           error: 'Cannot access Instagram tab. Please click the extension icon while on Instagram to grant permission.' 
         };
       }

       console.log('Starting campaign with tab:', tab.id, 'URL:', tab.url);

      const campaignId = Date.now().toString();
      const currentTime = Date.now();

      // Create campaign data object
      const campaign = {
        id: campaignId,
        tabId: tab.id,
        status: 'active',
        currentIndex: 0,
        name: campaignData.name || 'Untitled Campaign',
      leads: campaignData.leads || [],
      originalLeadCount: campaignData.leads?.length || 0,
      settings: campaignData.settings || {},
        stats: {
          processed: 0,
          followed: 0,
          messaged: 0,
          errors: 0,
          skipped: 0,
          successful: 0,
          failedFollows: 0,
          failedMessages: 0
        },
        performance: {
          successRate: 0,
          followSuccessRate: 0,
          messageSuccessRate: 0
        },
        createdAt: currentTime,
        startedAt: currentTime,
        lastUpdated: currentTime,
        errorLog: [],
        detailedResults: [],
        dailyActions: {
          [new Date().toISOString().split('T')[0]]: { follows: 0, messages: 0 }
        }
      };

      // Save to memory and storage
      this.campaigns.set(campaignId, campaign);
      await chrome.storage.local.set({
        [`campaign_${campaignId}`]: campaign,
        currentCampaign: campaignId
      });

      console.log(`Campaign ${campaignId} created with ${campaign.leads.length} leads`);

      // Pre-inject content script to ensure it's available
      try {
        console.log('Checking if content script is loaded...');
        const checkResult = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            return {
              hasInstagramAutomator: !!window.instagramAutomator,
              hasInstagramAutomatorClass: !!window.InstagramAutomator,
              url: window.location.href,
              readyState: document.readyState
            };
          }
        });
        
        const scriptStatus = checkResult[0]?.result;
        console.log('📜 Content Script Status:', JSON.stringify(scriptStatus, null, 2));
        
        if (!scriptStatus?.hasInstagramAutomator && !scriptStatus?.hasInstagramAutomatorClass) {
          console.log('⚠️ Content script not loaded, injecting content-script.js...');
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-script.js']
          });
          
          // Wait for injection to complete
          console.log('⏳ Waiting for script injection...');
          await this.sleep(3000);
          
          // Verify injection worked
          const verifyResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              return {
                hasInstagramAutomator: !!window.instagramAutomator,
                hasInstagramAutomatorClass: !!window.InstagramAutomator
              };
            }
          });
          
          console.log('✅ Post-injection verification:', verifyResult[0]?.result);
        } else {
          console.log('✅ Content script already available and ready.');
        }
      } catch (scriptError) {
        console.error('❌ Script injection/check error:', scriptError);
        await this.logCampaignError(campaignId, 'Script injection failed', scriptError.message);
        // Continue anyway, maybe it will work
      }

      // Start campaign execution
      this.executeCampaign(campaignId);

      return { 
        success: true, 
        campaignId: campaignId, 
        message: `Campaign started with ${campaign.leads.length} leads`,
        startTime: currentTime 
      };

    } catch (error) {
      console.error('Start campaign error:', error);
      return { success: false, error: error.message };
    }
  }

  async executeCampaign(campaignId) {
    try {
      // Verify tab still exists and is accessible
      let campaign = this.campaigns.get(campaignId);
      if (campaign) {
        try {
          const tab = await chrome.tabs.get(campaign.tabId);
          if (!tab || tab.status === 'complete' && !tab.url?.includes('instagram.com')) {
            throw new Error('Tab closed or navigated away from Instagram');
          }
        } catch (tabError) {
          console.error('Campaign tab no longer accessible:', tabError.message);
          campaign.status = 'paused';
          campaign.lastUpdated = Date.now();
          await this.updateCampaignStatus(campaignId, 'paused');
          return;
        }
      }
      
      // Robustly retrieve campaign from memory or storage with schema recovery
      campaign = this.campaigns.get(campaignId);
      if (!campaign) {
        const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
        if (stored && stored[`campaign_${campaignId}`]) {
          campaign = stored[`campaign_${campaignId}`];
          this.campaigns.set(campaignId, campaign);
          console.log(`📥 Loaded campaign ${campaignId} from storage on first access`);
        } else {
          console.error(`Campaign ${campaignId} not found in memory or storage.`);
          return;
        }
      }

      // Defensively ensure critical schema fields exist before use
      if (!campaign.leads) {
        console.warn(`Campaign ${campaignId} missing leads array. Initializing empty.`);
        campaign.leads = [];
      }
      if (typeof campaign.currentIndex !== 'number') {
        console.warn(`Campaign ${campaignId} missing currentIndex. Resetting to 0.`);
        campaign.currentIndex = 0;
      }
      if (!campaign.stats) {
        campaign.stats = {
          processed: 0, followed: 0, messaged: 0, errors: 0,
          skipped: 0, successful: 0, todayFollows: 0, todayMessages: 0,
          failedFollows: 0, failedMessages: 0
        };
      }
      if (!campaign.settings) {
        campaign.settings = {};
      }
      if (!campaign.dailyActions) {
        campaign.dailyActions = {
          [new Date().toISOString().split('T')[0]]: { follows: 0, messages: 0 }
        };
      }

      // Check if all leads have been processed
      if (campaign.currentIndex >= campaign.leads.length) {
        console.log(`Campaign ${campaignId} completed`);
        campaign.status = 'completed';
        await this.updateCampaignStatus(campaignId, 'completed');
        
        // Notify dashboard
        try {
          chrome.runtime.sendMessage({
            type: 'CAMPAIGN_COMPLETED',
            campaignId: campaignId
          });
        } catch (e) {
          console.log('Dashboard not available:', e.message);
        }
        return;
      }

      // Check if campaign is paused
      if (campaign.status === 'paused') {
        console.log(`Campaign ${campaignId} is paused, waiting...`);
        setTimeout(() => { this.executeCampaign(campaignId); }, 5000);
        return;
      }

      // Check daily limits
      if (await this.checkDailyLimits(campaignId, campaign.settings)) {
        console.log(`Campaign ${campaignId} paused due to daily limits`);
        campaign.status = 'paused_daily_limit';
        await this.updateCampaignStatus(campaignId, 'paused_daily_limit');
        return;
      }

      // Get current lead
      const currentIndex = campaign.currentIndex || 0;
      const lead = campaign.leads[currentIndex];
      
      if (!lead) {
        console.error(`Lead not found at index ${currentIndex}`);
        campaign.currentIndex++;
        setTimeout(() => {
          this.executeCampaign(campaignId);
        }, 30000);
        return;
      }

      const startTime = Date.now();
      
      // Navigate to profile using Background Script (prevents script death)
      const targetUrl = `https://www.instagram.com/${lead.username}/`;
      console.log(`🔄 Navigating tab ${campaign.tabId} to ${targetUrl}`);
      
      await chrome.tabs.update(campaign.tabId, { url: targetUrl });
      
      // Wait for tab load to complete
      await new Promise((resolve) => {
        const listener = (tid, changeInfo) => {
          if (tid === campaign.tabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        // Timeout backup
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 15000);
      });

      // Check pause after navigation
      campaign = this.campaigns.get(campaignId);
      if (campaign?.status === 'paused') {
        console.log(`Campaign ${campaignId} paused after navigation`);
        return;
      }

      // Wait a bit more for React hydration
      await this.sleep(3000);

      // Re-inject content script if needed (navigation might have cleared it)
      try {
          await chrome.scripting.executeScript({
            target: { tabId: campaign.tabId },
            files: ['content-script.js']
          });
          await this.sleep(1000); // Allow script to init
      } catch (e) {
          console.log('Script might already be there:', e.message);
      }

      // Check pause after script injection
      campaign = this.campaigns.get(campaignId);
      if (campaign?.status === 'paused') {
        console.log(`Campaign ${campaignId} paused after script injection`);
        return;
      }

      // Check pause before processing lead
      campaign = this.campaigns.get(campaignId);
      if (campaign?.status === 'paused') {
        console.log(`Campaign ${campaignId} paused before processing lead`);
        return;
      }

      const result = await chrome.scripting.executeScript({
        target: { tabId: campaign.tabId },
        func: function(leadData, settingsData) {
          return new Promise(async (resolve) => {
            try {
              if (!window.instagramAutomator) {
                 if (window.InstagramAutomator) {
                    window.instagramAutomator = new window.InstagramAutomator();
                 } else {
                    resolve({ success: false, error: 'Automator not loaded' });
                    return;
                 }
              }
              // Skip navigation in processLead since we are already here
              const result = await window.instagramAutomator.processLead(leadData, settingsData);
              resolve(result);
            } catch (error) {
              resolve({ success: false, error: error.message });
            }
          });
        },
        args: [lead, campaign.settings]
      });

      const actionResult = result[0]?.result || { success: false, error: 'No result returned' };
      const responseTime = Date.now() - startTime;
      
      console.log('🚀 Raw execution result:', result);
      console.log('📊 Processed action result:', actionResult);
      console.log('⏱️ Response time:', responseTime + 'ms');
      
      // Log detailed result
      await this.logDetailedResult(campaignId, {
        leadIndex: currentIndex,
        username: lead.username,
        result: actionResult,
        responseTime: responseTime,
        timestamp: Date.now()
      });

      // Update stats
      await this.updateCampaignStats(campaignId, actionResult);

      // Move to next lead
      campaign.currentIndex++;

      // PERSISTENCE: Save current index immediately to storage
      try {
        const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
        if (stored["campaign_" + campaignId]) {
          stored["campaign_" + campaignId].currentIndex = campaign.currentIndex;
          stored["campaign_" + campaignId].lastUpdated = Date.now();
          await chrome.storage.local.set(stored);
          
          // Sync memory
          if (this.campaigns.has(campaignId)) {
            this.campaigns.set(campaignId, stored[`campaign_${campaignId}`]);
          }
        }
      } catch (e) {
        console.error('Failed to save campaign progress:', e);
      }
      
      // Calculate delay before next action
      const delay = this.calculateDelay(campaign.settings);
      console.log(`Next action in ${delay/1000} seconds`);
      
      setTimeout(() => {
        this.executeCampaign(campaignId);
      }, delay);

    } catch (error) {
      console.error('Campaign execution error:', error);
      console.error('Error stack:', error.stack);
      
      const errorMessage = error.message;
      // Attempt to safely log and update stats
      try {
        await this.logCampaignError(campaignId, 'Execution error', errorMessage);
        await this.updateCampaignStats(campaignId, { success: false, error: error.message });
      } catch (logErr) {
        console.error('Failed to log campaign error:', logErr);
      }
      
      // Safely increment currentIndex in storage to skip the broken lead
      try {
        const errCampaign = this.campaigns.get(campaignId);
        if (errCampaign) {
          errCampaign.currentIndex++;
          // Persist the incremented index immediately
          const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
          if (stored && stored[`campaign_${campaignId}`]) {
            stored[`campaign_${campaignId}`].currentIndex = errCampaign.currentIndex;
            stored[`campaign_${campaignId}`].lastUpdated = Date.now();
            await chrome.storage.local.set(stored);
            
            // Sync memory
            if (this.campaigns.has(campaignId)) {
              this.campaigns.set(campaignId, stored[`campaign_${campaignId}`]);
            }
          }
        }
      } catch (indexErr) {
        console.error('Failed to increment currentIndex after error:', indexErr);
      }
      
      // Continue with next lead after error
      setTimeout(() => {
        this.executeCampaign(campaignId);
      }, 30000); // 30 second delay after error
    }
  }

  async logCampaignError(campaignId, errorType, errorMessage) {
    try {
      const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
      if (stored[`campaign_${campaignId}`]) {
        if (!stored[`campaign_${campaignId}`].errorLog) {
          stored[`campaign_${campaignId}`].errorLog = [];
        }
        
        stored[`campaign_${campaignId}`].errorLog.push({
          type: errorType,
          message: errorMessage,
          timestamp: Date.now()
        });
        
        await chrome.storage.local.set(stored);
        console.log(`Logged error: ${errorType} - ${errorMessage}`);
        
        // Sync memory
        if (this.campaigns.has(campaignId)) {
          this.campaigns.set(campaignId, stored[`campaign_${campaignId}`]);
        }
      }
    } catch (error) {
      console.error('Error logging campaign error:', error);
    }
  }

  async logDetailedResult(campaignId, resultData) {
    try {
      const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
      if (stored[`campaign_${campaignId}`]) {
        if (!stored[`campaign_${campaignId}`].detailedResults) {
          stored[`campaign_${campaignId}`].detailedResults = [];
        }
        
        stored[`campaign_${campaignId}`].detailedResults.push(resultData);
        await chrome.storage.local.set(stored);
        
        // Sync memory
        if (this.campaigns.has(campaignId)) {
          this.campaigns.set(campaignId, stored[`campaign_${campaignId}`]);
        }
      }
    } catch (error) {
      console.error('Error logging detailed result:', error);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // NEW: Check daily action limits
  async checkDailyLimits(campaignId, settings) {
    const today = new Date().toISOString().split('T')[0];
    const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
    const campaign = stored[`campaign_${campaignId}`];
    
    if (!campaign || !campaign.dailyActions) return false;
    
    const todayActions = campaign.dailyActions[today] || { follows: 0, messages: 0 };
    
    if (settings.dailyFollows && todayActions.follows >= settings.dailyFollows) {
      console.log(`📊 Daily follow limit reached: ${todayActions.follows}/${settings.dailyFollows}`);
      return true;
    }
    
    if (settings.dailyMessages && todayActions.messages >= settings.dailyMessages) {
      console.log(`📊 Daily message limit reached: ${todayActions.messages}/${settings.dailyMessages}`);
      return true;
    }
    
    return false;
  }

  async checkDailyLimitResets() {
    try {
      const data = await chrome.storage.local.get(null);
      const campaignKeys = Object.keys(data).filter(k => k.startsWith('campaign_'));
      
      const today = new Date().toISOString().split('T')[0];
      
      for (const key of campaignKeys) {
        const campaign = data[key];
        
        // Check if campaign is paused due to daily limit
        if (campaign.status === 'paused_daily_limit') {
          // Check if daily actions have been reset (new day)
          const todayActions = campaign.dailyActions?.[today] || { follows: 0, messages: 0 };
          
          // If no actions today, it's a new day - resume campaign
          if (todayActions.follows === 0 && todayActions.messages === 0) {
            console.log(`🔄 Resuming campaign ${campaign.id} from daily limit (new day)`);
            campaign.status = 'active';
            campaign.lastUpdated = Date.now();
            await chrome.storage.local.set({ [key]: campaign });
            
            // Also update memory if present
            if (this.campaigns.has(campaign.id)) {
              this.campaigns.set(campaign.id, campaign);
            }
            
            // Resume execution if we have a valid tab
            const tab = await this.findInstagramTab();
            if (tab) {
              const canAccess = await this.canAccessTab(tab.id);
              if (canAccess) {
                this.executeCampaign(campaign.id);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking daily limit resets:', error);
    }
  }

  calculateDelay(settings) {
    const minDelay = settings.minDelay || 30000; // 30 seconds
    const maxDelay = settings.maxDelay || 120000; // 2 minutes
    
    // NEW: If smartDelays enabled, use non-uniform distribution
    if (settings.smartDelays) {
      // Beta-distribution-like clustering (more values toward middle, occasional extremes)
      const u = Math.random();
      const v = Math.random();
      const betaLike = (Math.pow(u, 2) * Math.pow(v, 2)) / (Math.pow(u, 2) + Math.pow(v, 2));
      return Math.floor(minDelay + (maxDelay - minDelay) * betaLike);
    }
    
    // Default: uniform random distribution
    const baseDelay = Math.random() * (maxDelay - minDelay) + minDelay;
    const randomFactor = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2 multiplier
    return Math.floor(baseDelay * randomFactor);
  }

  async updateCampaignStats(campaignId, result) {
    try {
      const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
      const campaign = stored[`campaign_${campaignId}`];
      
      if (campaign) {
        // Ensure stats object exists with default values
        if (!campaign.stats) {
          console.warn(`Campaign ${campaignId} missing stats object. Initializing.`);
          campaign.stats = {
            processed: 0, followed: 0, messaged: 0, errors: 0,
            skipped: 0, successful: 0, todayFollows: 0, todayMessages: 0,
            failedFollows: 0, failedMessages: 0
          };
        }
        campaign.stats.processed++;
        
        // NEW: Track daily actions
        const today = new Date().toISOString().split('T')[0];
        if (!campaign.dailyActions) campaign.dailyActions = {};
        if (!campaign.dailyActions[today]) {
          campaign.dailyActions[today] = { follows: 0, messages: 0 };
        }
        
        if (result.followed) {
          campaign.stats.followed++;
          campaign.stats.todayFollows++;
          campaign.stats.successful++;
          campaign.dailyActions[today].follows++;
        } else if (result.followed === false) {
          campaign.stats.failedFollows++;
        }
        
        if (result.messaged) {
          campaign.stats.messaged++;
          campaign.stats.todayMessages++;
          campaign.stats.successful++;
          campaign.dailyActions[today].messages++;
        } else if (result.messaged === false) {
          campaign.stats.failedMessages++;
        }
        
        if (!result.success) {
          campaign.stats.errors++;
        } else if (!result.followed && !result.messaged) {
          campaign.stats.skipped++;
        }
        
        // Update performance metrics
        const totalActions = campaign.stats.followed + campaign.stats.messaged;
        const campaignSettings = campaign.settings || {};
        const actionsPerLead = (campaignSettings.followEnabled !== false ? 1 : 0) +
                                (campaignSettings.messageEnabled !== false ? 1 : 0);
        const totalAttempts = campaign.stats.processed * Math.max(actionsPerLead, 1);
        campaign.performance.successRate = totalAttempts > 0 ? (totalActions / totalAttempts) * 100 : 0;
        
        const followAttempts = campaign.stats.followed + campaign.stats.failedFollows;
        campaign.performance.followSuccessRate = followAttempts > 0 ? (campaign.stats.followed / followAttempts) * 100 : 0;
        
        const messageAttempts = campaign.stats.messaged + campaign.stats.failedMessages;
        campaign.performance.messageSuccessRate = messageAttempts > 0 ? (campaign.stats.messaged / messageAttempts) * 100 : 0;
        
        campaign.lastUpdated = Date.now();
        
        await chrome.storage.local.set({
          [`campaign_${campaignId}`]: campaign
        });
        
        // Sync memory
        if (this.campaigns.has(campaignId)) {
          this.campaigns.set(campaignId, campaign);
        }
      }
    } catch (error) {
      console.error('Error updating campaign stats:', error);
    }
  }

  async updateCampaignStatus(campaignId, status) {
    try {
      const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
      if (stored[`campaign_${campaignId}`]) {
        stored[`campaign_${campaignId}`].status = status;
        stored[`campaign_${campaignId}`].lastUpdated = Date.now();
        
        if (status === 'completed') {
          stored[`campaign_${campaignId}`].completedAt = Date.now();
        }
        
        await chrome.storage.local.set(stored);
        
        // Sync memory
        if (this.campaigns.has(campaignId)) {
          this.campaigns.set(campaignId, stored[`campaign_${campaignId}`]);
        }
      }
    } catch (error) {
      console.error('Error updating campaign status:', error);
    }
  }

  async getCampaignStats(campaignId) {
    try {
      const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
      const campaign = stored[`campaign_${campaignId}`];
      const stats = campaign?.stats || {
        processed: 0,
        followed: 0,
        messaged: 0,
        errors: 0,
        todayFollows: 0,
        todayMessages: 0,
        skipped: 0,
        successful: 0,
        failedFollows: 0,
        failedMessages: 0
      };
      const runTime = campaign
        ? (campaign.completedAt || campaign.stoppedAt || Date.now()) - (campaign.startedAt || campaign.createdAt || Date.now())
        : 0;
      return { ...stats, runTime };
    } catch (error) {
      console.error('Error getting campaign stats:', error);
      return {
        processed: 0, followed: 0, messaged: 0, errors: 0,
        todayFollows: 0, todayMessages: 0, skipped: 0, successful: 0,
        failedFollows: 0, failedMessages: 0, runTime: 0
      };
    }
  }

  async getDetailedCampaignStats(campaignId) {
    try {
      const stored = await chrome.storage.local.get(`campaign_${campaignId}`);
      const campaign = stored[`campaign_${campaignId}`];
      
      if (!campaign) return null;
      
      const runTime = campaign.completedAt ? 
        campaign.completedAt - campaign.startedAt : 
        Date.now() - (campaign.startedAt || campaign.createdAt);
      
      return {
        ...campaign.stats,
        performance: campaign.performance,
        metadata: {
          campaignName: campaign.name,
          status: campaign.status,
          createdAt: campaign.createdAt,
          startedAt: campaign.startedAt,
          completedAt: campaign.completedAt,
          runTime: runTime,
          originalLeadCount: campaign.originalLeadCount,
          settings: campaign.settings
        },
        detailedResults: campaign.detailedResults || [],
        errorLog: campaign.errorLog || []
      };
    } catch (error) {
      console.error('Error getting detailed campaign stats:', error);
      return null;
    }
  }

  async generateCampaignReport(campaignId) {
    try {
      const detailedStats = await this.getDetailedCampaignStats(campaignId);
      if (!detailedStats) return null;
      
      // Generate CSV data
      const csvHeaders = [
        'Username', 'Status', 'Followed', 'Messaged', 'Response Time (ms)', 
        'Timestamp', 'Error Message'
      ];
      
      const csvRows = detailedStats.detailedResults.map(result => [
        result.username || '',
        result.result.success ? 'Success' : 'Failed',
        result.result.followed ? 'Yes' : 'No',
        result.result.messaged ? 'Yes' : 'No',
        result.responseTime || '',
        new Date(result.timestamp).toLocaleString(),
        result.result.error || ''
      ]);
      
      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');
      
      // Generate summary report
      const summary = {
        campaignName: detailedStats.metadata.campaignName,
        status: detailedStats.metadata.status,
        duration: this.formatDuration(detailedStats.metadata.runTime),
        totalLeads: detailedStats.metadata.originalLeadCount,
        processed: detailedStats.processed,
        successful: detailedStats.successful,
        followed: detailedStats.followed,
        messaged: detailedStats.messaged,
        errors: detailedStats.errors,
        successRate: detailedStats.performance.successRate,
        followSuccessRate: detailedStats.performance.followSuccessRate,
        messageSuccessRate: detailedStats.performance.messageSuccessRate,
        createdAt: new Date(detailedStats.metadata.createdAt).toLocaleString(),
        completedAt: detailedStats.metadata.completedAt ? 
          new Date(detailedStats.metadata.completedAt).toLocaleString() : 'Still running'
      };
      
      return {
        summary,
        csvContent,
        detailedResults: detailedStats.detailedResults,
        errorLog: detailedStats.errorLog,
        filename: `Instagram_Campaign_${detailedStats.metadata.campaignName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`
      };
    } catch (error) {
      console.error('Error generating campaign report:', error);
      return null;
    }
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // This function runs in the Instagram tab context
  static executeInstagramAction(lead, settings) {
    return new Promise(async (resolve) => {
      try {
        console.log('🚀 Executing Instagram action for:', lead.username);
        console.log('🔧 Settings:', settings);
        
        // Wait for page to be ready
        if (document.readyState !== 'complete') {
          console.log('📄 Waiting for page to load...');
          await new Promise(resolve => {
            if (document.readyState === 'complete') resolve();
            else document.addEventListener('DOMContentLoaded', resolve);
          });
        }

        // Enhanced automator initialization
        if (!window.instagramAutomator) {
          console.log('🔄 Instagram automator not found, attempting to initialize...');
          
          // Try to initialize automator
          if (window.InstagramAutomator) {
            try {
              window.instagramAutomator = new window.InstagramAutomator();
              console.log('✅ Automator initialized successfully');
              
              // Wait for initialization
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (initError) {
              console.error('❌ Error initializing automator:', initError);
              resolve({ 
                success: false, 
                error: 'Automator initialization failed: ' + initError.message,
                followed: false,
                messaged: false
              });
              return;
            }
          } else {
            console.error('❌ InstagramAutomator class not available');
            resolve({ 
              success: false, 
              error: 'InstagramAutomator class not available. Content script may not be loaded.',
              followed: false,
              messaged: false
            });
            return;
          }
        }

        if (!window.instagramAutomator) {
          console.error('❌ Instagram automator still not available after initialization attempt');
          resolve({ 
            success: false, 
            error: 'Automator not initialized after multiple attempts',
            followed: false,
            messaged: false
          });
          return;
        }

        console.log('🎯 Processing lead with automator...');
        console.log('📍 Current URL:', window.location.href);
        
        const result = await window.instagramAutomator.processLead(lead, settings);
        console.log('✅ Automator result:', result);
        
        // Ensure result has proper structure
        const finalResult = {
          success: result.success || false,
          followed: result.followed || false,
          messaged: result.messaged || false,
          error: result.error || null,
          ...result
        };
        
        resolve(finalResult);
      } catch (error) {
        console.error('💥 Action execution error:', error);
        console.error('📋 Error stack:', error.stack);
        resolve({ 
          success: false, 
          error: 'Execution error: ' + error.message,
          followed: false,
          messaged: false
        });
      }
    });
  }

  async checkInstagramSession(tabId) {
    // Only check session on navigation, not every update
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab?.url?.includes('instagram.com')) return;
      
      const authResult = await this.checkAuthentication();
      if (!authResult.isLoggedIn) {
        console.log('Instagram session lost');
        // Could pause active campaigns here
      }
    } catch (error) {
      console.error('Session check error:', error);
    }
  }
}

// Initialize background manager
new BackgroundManager();