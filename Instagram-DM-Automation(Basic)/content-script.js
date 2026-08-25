/* Instagram DM Automation - Content Script v2.2 */
/* This entire script is wrapped in an IIFE to prevent 'Identifier has already been declared' errors upon re-injection. */
(function() {
  'use strict';

  // ============================================================================
  //  GUARD: Prevent duplicate class execution on re-injection
  // ============================================================================
  if (typeof window.instagramAutomator !== 'undefined') {
    console.log('[DM Auto] Content script already loaded. Skipping re-definition.');
    return;
  }

  // ============================================================================
  // CLASS DEFINITION
  // ============================================================================
  class InstagramAutomator {
    constructor() {
      this.isActive = false;
      this.actionInProgress = false;
      this.isPaused = false;
      this.safetyLimits = {
        dailyFollows: 60,
        dailyMessages: 100,
        minDelay: 30000
      };
      
      // Dynamic Configuration State
      this.config = {
          selectors: {
              messageInput: [],
              sendButton: []
          },
          // Default Instagram "Paper Plane" Icon
          sendIconPath: "M22.513 3.576C21.826 2.552" 
      };

      this.init();
      this.log('Instagram Automator v2.2 initialized with enhanced debugging');
    }

    log(message, type = 'info') {
      // Print to console with emoji based on type
      const prefix = type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️');
      console.log(`${prefix} [Automator] ${message}`);

      // Send to background for dashboard display
      try {
        // Avoid infinite loops if sendMessage fails
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            type: 'LOG_DEBUG',
            source: 'Content Script',
            level: type,
            message: message
          }).catch(() => {}); // Ignore errors if background is unreachable
        }
      } catch (e) {
        // Ignore
      }
    }

    async init() {
      // Load remote config overrides if they exist
      try {
          const stored = await chrome.storage.local.get('remoteConfig');
          if (stored.remoteConfig) {
              this.log('Loaded remote configuration overrides');
              if (stored.remoteConfig.sendIconPath) {
                  this.config.sendIconPath = stored.remoteConfig.sendIconPath;
              }
              if (stored.remoteConfig.selectors) {
                  this.config.selectors = { ...this.config.selectors, ...stored.remoteConfig.selectors };
              }
          }
      } catch (e) {
          console.error('Failed to load remote config:', e);
      }

      // Only activate on main Instagram pages
      if (window.location.hostname.includes('instagram.com')) {
        this.setupObservers();
        this.setupMessageListener();
        this.waitForPageLoad();
        console.log('✅ Instagram Automator active on', window.location.href);
      } else {
        console.log('❌ Not on Instagram domain:', window.location.hostname);
      }
    }

    setupMessageListener() {
      if (!chrome.runtime || !chrome.runtime.onMessage) return;
      
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'PAUSE_CAMPAIGN') {
          this.isPaused = message.paused;
          this.log(`Campaign ${message.paused ? 'paused' : 'resumed'}`);
          sendResponse({ success: true });
        }
        return true; // Keep channel open for async response
      });
    }

    async waitForPageLoad() {
      this.log('Waiting for Instagram page to load...');
      
      // Wait for React app to load
      let attempts = 0;
      const maxAttempts = 60; // Increased to 60 seconds
      
      while (attempts < maxAttempts) {
        if (this.isInstagramLoaded()) {
          this.log('Instagram app detected as loaded');
          break;
        }
        await this.sleep(1000);
        attempts++;
        
        if (attempts % 10 === 0) {
          this.log(`⏳ Still waiting for Instagram to load... (${attempts}/${maxAttempts})`);
        }
      }
      
      if (attempts >= maxAttempts) {
        this.log('WARNING: Instagram load timeout - attempting to proceed cautiously', 'warning');
      }
      
      // Additional wait for complete initialization
      await this.sleep(3000);
      this.logCurrentPageInfo();
    }

    logCurrentPageInfo() {
      const info = {
        url: window.location.href,
        pathname: window.location.pathname,
        hasNav: !!document.querySelector('nav'),
        hasProfileLinks: document.querySelectorAll('a[href^="/"][href$="/"]').length,
        hasSearchBar: !!document.querySelector('input[placeholder*="Search"]'),
        hasLoginForm: !!document.querySelector('input[name="username"]'),
        readyState: document.readyState,
        title: document.title
      };
      
      console.log('📊 Instagram page info:', info);
    }

    isInstagramLoaded() {
      // Check for various indicators that Instagram has loaded
      // We'll be more permissive to avoid timeouts on slow connections or UI updates
      const indicators = [
        document.querySelector('main'),
        document.querySelector('[role="main"]'),
        document.querySelector('nav'),
        document.querySelector('svg[aria-label="Instagram"]'),
        document.querySelector('svg[aria-label="Home"]'),
        document.querySelectorAll('a').length > 5, // Basic navigation exists
        document.title && !document.title.includes('Instagram') // Title is set to something specific (e.g. "Name (@user)...")
      ];
      
      // Check if we have at least 2 strong indicators or the readyState is complete with basic content
      const loadedCount = indicators.filter(Boolean).length;
      const hasBasicContent = document.body && document.body.innerText.length > 500;
      
      if (loadedCount >= 2 || (document.readyState === 'complete' && hasBasicContent)) {
        return true;
      }
      
      return false;
    }

    setupObservers() {
      // Listen for page navigation changes
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            this.handlePageChange();
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Also listen for URL changes (SPA navigation)
      let currentUrl = window.location.href;
      setInterval(() => {
        if (currentUrl !== window.location.href) {
          currentUrl = window.location.href;
          console.log('🔄 URL changed to:', currentUrl);
          this.handlePageChange();
        }
      }, 1000);
    }

    handlePageChange() {
      // Update current page context
      this.currentPage = this.detectCurrentPage();
    }

    detectCurrentPage() {
      const path = window.location.pathname;
      if (path === '/') return 'home';
      if (path === '/direct/inbox/') return 'messages';
      if (path.startsWith('/direct/t/')) return 'conversation';
      if (path.match(/^\/[^\/]+\/?$/)) return 'profile';
      return 'other';
    }

    // Enhanced username detection method
    getCurrentUsername() {
      console.log('🔍 Starting enhanced username detection...');
      
      // Method 1: Profile page with edit button (most reliable for own profile)
      if (window.location.pathname.match(/^\/[a-zA-Z0-9._]{1,30}\/?$/)) {
        const pathUsername = window.location.pathname.replace(/\//g, '');
        const editButton = document.querySelector('[data-testid*="edit"], button[aria-label*="Edit"]');
        
        if (editButton && pathUsername) {
          console.log('✅ Method 1: Found username on own profile page:', pathUsername);
          return pathUsername;
        }
      }
      
      // Method 2: Navigation profile link
      const navLinks = document.querySelectorAll('nav a, [role="navigation"] a');
      for (const link of navLinks) {
        const href = link.getAttribute('href');
        if (href && href.match(/^\/[a-zA-Z0-9._]{1,30}\/?$/)) {
          const profileImg = link.querySelector('img[alt*="profile"], img[style*="border-radius"], img[data-testid*="user"]');
          if (profileImg) {
            const username = href.replace(/\//g, '');
            console.log('✅ Method 2: Found username in navigation:', username);
            return username;
          }
        }
      }
      
      // Method 3: Look for username in DOM content
      const textNodes = this.getTextNodes(document.body);
      const usernamePatterns = [
        /@([a-zA-Z0-9._]{1,30})\b/g,
        /Logged in as ([a-zA-Z0-9._]{1,30})/i,
        /Welcome,?\s*([a-zA-Z0-9._]{1,30})/i
      ];
      
      for (const node of textNodes) {
        for (const pattern of usernamePatterns) {
          const match = node.textContent.match(pattern);
          if (match && match[1]) {
            console.log('✅ Method 3: Found username in text:', match[1]);
            return match[1];
          }
        }
      }
      
      console.log('❌ No username found with any method');
      return null;
    }
    
    getTextNodes(element) {
      const textNodes = [];
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.trim()) {
          textNodes.push(node);
        }
      }
      return textNodes;
    }

    async processLead(lead, settings) {
      if (this.actionInProgress) {
        this.log('WARNING: Another action already in progress');
        return { success: false, error: 'Another action in progress' };
      }

      // Check if paused
      if (this.isPaused) {
        this.log('Campaign is paused, skipping lead');
        return { success: false, error: 'Campaign paused', paused: true };
      }

      this.actionInProgress = true;
      
      try {
        this.log(`🎯 Processing lead: ${lead.username}`);
        this.log(`⚙️ Settings: ${JSON.stringify(settings)}`);
        
        const result = { 
          success: true, 
          followed: false, 
          messaged: false,
          error: null,
          wasAlreadyFollowing: false,
          skipped: false
        };

        // Step 1: Verify we are on the profile
        // Background script handles navigation now to prevent script death
        if (!window.location.href.includes(lead.username)) {
          this.log(`⚠️ URL (${window.location.href}) might not match username (${lead.username})`, 'warning');
        } else {
          this.log('Correctly positioned on profile page');
        }
        
        // MANDATORY: Wait for profile to load with event-based detection
        this.log('Waiting for profile to load...');
        const profileLoaded = await this.waitForProfileLoad();
        
        if (!profileLoaded) {
          this.log('Profile failed to load', 'error');
          result.success = false;
          result.error = 'Profile failed to load';
          return result;
        }

        // Check pause after profile load
        if (this.isPaused) {
          this.log('Campaign paused after profile load');
          return { success: false, error: 'Campaign paused', paused: true };
        }

        // MANDATORY: Additional delay after profile loads (1-2 seconds)
        this.log('Profile loaded, waiting for UI to stabilize...');
        await this.humanDelay(
          settings.profileLoadDelay?.min || 1000, 
          settings.profileLoadDelay?.max || 2000
        );

        // Check pause after profile load delay
        if (this.isPaused) {
          this.log('Campaign paused after profile load delay');
          return { success: false, error: 'Campaign paused', paused: true };
        }

        // NEW: Check if private account and skip if configured
        if (settings.skipPrivate) {
          const isPrivate = await this.isPrivateAccount();
          if (isPrivate) {
            this.log('Account is private. Skipping.');
            result.skipped = true;
            result.success = true; // Consider as processed but skipped
            return result;
          }
        }

        const alreadyFollowing = await this.checkIfFollowing();
        if (alreadyFollowing) {
          this.log('Already following this user');
          result.wasAlreadyFollowing = true;
          result.followed = true; // Mark as followed since we're already following
        }

        // Check pause before follow action
        if (this.isPaused) {
          this.log('Campaign paused before follow');
          return { success: false, error: 'Campaign paused', paused: true };
        }

        // Step 2: Follow if enabled and NOT already following
        if (settings.followEnabled && !alreadyFollowing) {
          this.log('Step 2: Attempting to follow user...');
          const followResult = await this.followUser();
          result.followed = followResult.success;
          this.log(`👥 Follow result: ${JSON.stringify(followResult)}`);

          // Recovery: if followUser() reported failure but the button simply
          // wasn't found, the user is very likely already following. Confirm
          // and surface that so the messaging step is not skipped.
          if (!followResult.success && /follow button not found/i.test(followResult.reason || '')) {
            const actuallyFollowing = await this.checkIfFollowing();
            if (actuallyFollowing) {
              this.log('Recovery: follow button missing but user is already following');
              result.wasAlreadyFollowing = true;
              result.followed = true;
            } else {
              // Belt-and-suspenders: scan all visible buttons for any whose
              // text starts with "following" or "requested". The
              // startsWith check correctly handles the IG concatenated-text
              // case ("followingdown chevron icon") while naturally excluding
              // "follow" and "follow back" (which are strictly shorter).
              const anyFollowingBtn = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"]'))
                .find(btn => {
                  if (!(btn.offsetWidth > 0 && btn.offsetHeight > 0)) return false;
                  const t = (btn.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
                  const a = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
                  return t.startsWith('following') || t.startsWith('requested') ||
                         a === 'following' || a === 'requested' ||
                         a.startsWith('following ') || a.startsWith('requested ');
                });
              if (anyFollowingBtn) {
                this.log('Recovery (deep scan): found "Following"/"Requested" state button');
                result.wasAlreadyFollowing = true;
                result.followed = true;
              }
            }
          }
          
          if (followResult.success) {
            // MANDATORY: Wait for follow to be processed (2-4 seconds)
            this.log('MANDATORY DELAY: Waiting for follow to be processed by Instagram...');
            await this.humanDelay(
              settings.followProcessDelay?.min || 2000,
              settings.followProcessDelay?.max || 4000
            );
            
            // Check pause after follow delay
            if (this.isPaused) {
              this.log('Campaign paused after follow delay');
              return { success: false, error: 'Campaign paused', paused: true };
            }
            
            // Verify follow was successful
            const followConfirmed = await this.checkIfFollowing();
            if (followConfirmed) {
              this.log('Follow confirmed successful');
              
              // MANDATORY: Additional delay AFTER confirmation (2-4 seconds)
              this.log('MANDATORY DELAY: Waiting after follow confirmation...');
              await this.humanDelay(2000, 4000);
              
              // Check pause after follow confirmation delay
              if (this.isPaused) {
                this.log('Campaign paused after follow confirmation delay');
                return { success: false, error: 'Campaign paused', paused: true };
              }
            } else {
              this.log('WARNING: Follow may not have been processed');
            }
          } else {
            this.log(`⚠️ Follow failed: ${followResult.reason}`);
          }
} else if (!settings.followEnabled) {
          this.log('Following disabled, skipping...');
        }

        // Check pause before message action
        if (this.isPaused) {
          this.log('Campaign paused before message');
          return { success: false, error: 'Campaign paused', paused: true };
        }

        // Step 3: Send message if enabled
        // Can message if: (messages enabled) AND (follow disabled OR we followed OR already following)
        const canAttemptMessage = settings.messageEnabled && lead.message && 
                                  (!settings.followEnabled || result.followed || result.wasAlreadyFollowing);
        
        if (canAttemptMessage) {
          this.log('Step 3: Attempting to send message...');
          this.log(`💬 Message capability: followed=${result.followed}, wasAlreadyFollowing=${result.wasAlreadyFollowing}`);
          
          const messageResult = await this.sendDirectMessageToFollowed(lead, settings);
          result.messaged = messageResult.success;
          this.log(`💬 Message result: ${JSON.stringify(messageResult)}`);
          
          if (!messageResult.success) {
            this.log(`⚠️ Message failed: ${messageResult.reason}`);
            if (!result.error) {
              result.error = 'Message failed: ' + messageResult.reason;
            }
          }
        } else if (settings.messageEnabled && lead.message) {
          this.log('Cannot message - not following user');
          result.error = 'Cannot message user without following first';
        } else {
          this.log('Messaging disabled or no message provided, skipping...');
        }

        // Final result validation
        if (!result.followed && !result.messaged && !result.wasAlreadyFollowing) {
          if (!result.error) {
            result.error = 'No actions completed successfully';
          }
          result.success = false;
        } else if (result.wasAlreadyFollowing || result.followed || result.messaged) {
          result.success = true; // Success if any action completed
        }

        this.log(`🏁 Final result: ${JSON.stringify(result)}`);
        return result;
        
      } catch (error) {
        this.log(`💥 Process lead error: ${error.message}`, 'error');
        return { 
          success: false, 
          error: error.message,
          followed: false,
          messaged: false,
          wasAlreadyFollowing: false
        };
      } finally {
        this.actionInProgress = false;
      }
    }

    // New method to handle "Accept message request" prompts
    async handleMessageRequestAccept() {
      try {
        this.log('Checking for message request "Accept" button...');
        
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const acceptButton = buttons.find(btn => {
          const text = btn.textContent?.trim()?.toLowerCase();
          const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
          const isVisible = btn.offsetWidth > 0 && btn.offsetHeight > 0;
          
          const isAcceptText = text === 'accept' || text === 'allow';
          const isAcceptLabel = label.includes('accept') || label.includes('allow');
          
          return (isAcceptText || isAcceptLabel) && isVisible;
        });

        if (acceptButton) {
          this.log('Found "Accept" button for message request. Clicking...');
          await this.simulateHumanClick(acceptButton);
          await this.sleep(2000); // Wait for input to become active
          return true;
        }
        
        this.log('INFO: No "Accept" button found (normal for established threads)');
        return false;
      } catch (error) {
        this.log('WARNING: Error handling message request accept: ' + error.message, 'warning');
        return false;
      }
    }

    // New method to handle "Move messages to General" prompt
    async handleMoveMessageToGeneral() {
      try {
        // Check for headings indicating the move prompt
        const headings = Array.from(document.querySelectorAll('h1, h2, div[role="heading"]'));
        const isMovePrompt = headings.some(h => h.textContent.includes('Move messages from'));
        
        if (isMovePrompt) {
          this.log('Found "Move messages from" prompt. Checking for "General" button...');
          const buttons = Array.from(document.querySelectorAll('button'));
          const generalButton = buttons.find(btn => btn.textContent.trim() === 'General');
          
          if (generalButton) {
            this.log('Found "General" button. Clicking...');
            await this.simulateHumanClick(generalButton);
            await this.sleep(2000); // Wait for transition/input to appear
            return true;
          } else {
              this.log('WARNING: Found prompt but no "General" button found.', 'warning');
          }
        }
        return false;
      } catch (error) {
        this.log('WARNING: Error handling move message prompt: ' + error.message, 'warning');
        return false;
      }
    }

    // New method to check if we can message the user
    async canMessageUser() {
      console.log('🔍 Checking if user can be messaged...');
      
      // Look for direct message button (appears when user can be messaged)
      const messageButton = await this.findMessageButton();
      if (messageButton) {
        console.log('✅ Direct message button found');
        return true;
      }
      
      // Check if we're already following this user
      const isFollowing = await this.checkIfFollowing();
      if (isFollowing) {
        console.log('✅ Already following user');
        return true;
      }
      
      console.log('❌ Cannot message user directly');
      return false;
    }

    // Enhanced method to send message to followed users
    async sendDirectMessageToFollowed(lead, settings) {
      try {
        this.log('Starting message flow for followed user...');
        const message = lead.message;
        
        // First, try to find the message button on the profile
        const messageButton = await this.findMessageButton();
        
        if (messageButton) {
          this.log('Found message button on profile');
          
          // Capture URL before clicking to detect navigation
          const preClickUrl = window.location.href;
          await this.simulateHumanClick(messageButton);
          
          // Wait longer for UI response (popup or navigation) - ROBUST NAVIGATION
          this.log('Waiting for Message UI (Popup or Navigation)...');
          await this.humanDelay(5000, 8000); 
          
          // Check if we navigated to DMs
          const postClickUrl = window.location.href;
          if (postClickUrl !== preClickUrl && postClickUrl.includes('/direct/')) {
             this.log('Navigated to DM thread, handling as direct message page...');
             
             // Wait for DM page to stabilize
             await this.sleep(3000);
             
             // Handle "Accept" prompt if it exists
             await this.handleMessageRequestAccept();
             
             // Handle "Move to General" prompt if it appears after accepting
             await this.handleMoveMessageToGeneral();

             // Standard DM page message flow
             this.log('Looking for message input in DM thread...');
             const messageInput = await this.findMessageInput();
             if (!messageInput) {
               return { success: false, reason: 'Message input not found after navigation' };
             }

             await this.typeHumanLike(messageInput, message, settings);
             await this.humanDelay(500, 1000);

             const sendButton = await this.findSendButton();
             if (!sendButton) {
               return { success: false, reason: 'Send button not found in DM thread' };
             }

             this.log('Sending message...');
             
             // Final verification: Is the message actually there?
             const currentText = messageInput.textContent || messageInput.value || '';
             if (currentText.length < message.length * 0.8) {
               this.log(`⚠️ Warning: Input text length (${currentText.length}) is much shorter than expected (${message.length}). React might have cleared it.`, 'warning');
             }

             await this.simulateHumanClick(sendButton);
             await this.humanDelay(500, 1000);
             
             return { success: true, action: 'message_sent_via_navigation' };
          }
          
          // If we didn't navigate, look for a popup
          this.log('URL did not change, looking for message popup...');
          
          // Handle "Accept" prompt if it exists in a popup or footer
          await this.handleMessageRequestAccept();
          
          // Handle "Move to General" prompt if it appears after accepting in popup
          await this.handleMoveMessageToGeneral();

          const messageInput = await this.findMessageInputInPopup();
          
          if (messageInput) {
            this.log('Found message input in popup');
            await this.typeHumanLike(messageInput, message, settings);
            await this.humanDelay(
              settings.typingDelay?.min || 500, 
              settings.typingDelay?.max || 1000
            );

            // Send message
            this.log('Looking for send button in popup...');
            const sendButton = await this.findSendButtonInPopup();
            if (!sendButton) {
              this.log('WARNING: Send button not found in popup. Attempting remote healing...');
              const healed = await this.initiateRemoteHealing();

              if (healed) {
                this.log('Healing successful, retrying send button search...');
                const finalTryButton = await this.findSendButtonInPopup();
                if (finalTryButton) {
                  // Retry sending...
                  await this.simulateHumanClick(finalTryButton);
                  await this.humanDelay(500, 1000);
                  return { success: true, action: 'message_sent_via_healed_popup' };
                }
              }
              return { success: false, reason: 'Send button not found even after healing' };
            }

            this.log('Sending message...');
            
            // Final verification: Is the message actually there?
            const currentText = messageInput.textContent || messageInput.value || '';
            if (currentText.length < message.length * 0.8) {
              this.log(`⚠️ Warning: Input text length (${currentText.length}) is much shorter than expected (${message.length}). React might have cleared it.`, 'warning');
            }

            await this.simulateHumanClick(sendButton);
            await this.humanDelay(500, 1000);
            
            return { success: true, action: 'message_sent_via_popup' };
          } else {
               this.log('Message input not found after exhaustive search.');
               return { success: false, reason: 'Message input not found in popup' };
          }
        }
        
        // Fallback: Navigate to DMs (older method)
        this.log('WARNING: Message button not found, trying generic DM navigation...');
        return await this.sendDirectMessage(lead.username, message);

      } catch (error) {
        this.log(`💥 Message error: ${error.message}`, 'error');
        return { success: false, reason: error.message };
      }
    }

    // New method to find message input in popup
    async findMessageInputInPopup() {
      this.log('Searching for message input in popup...');
      
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        // Merge remote config selectors
        const popupSelectors = [
          ...(this.config?.selectors?.messageInput ? [this.config.selectors.messageInput] : []),
          '[role="dialog"] div[contenteditable="true"]',
          '[role="dialog"] [aria-label*="Message"]',
          '[role="dialog"] [aria-placeholder*="Message"]',
          'div.xzsf02u[contenteditable="true"]', // Modern IG class
          '[role="dialog"] textarea',
          '.message-popup textarea',
          '[data-testid*="message"] textarea'
        ];

        for (const selector of popupSelectors) {
          try {
            const input = document.querySelector(selector);
            if (input && (input.offsetHeight > 0 || input.offsetWidth > 0)) {
              this.log(`✅ Found message input in popup: ${selector}`);
              return input;
            }
          } catch (e) {}
        }

        // Broad Fallback: Look for any visible textbox or message placeholder
        const dialogs = document.querySelectorAll('[role="dialog"], .popup, [class*="modal"], [data-pagelet*="Message"]');
        for (const dialog of dialogs) {
          if (dialog.offsetHeight > 0) {
            const textInputs = dialog.querySelectorAll('div[contenteditable="true"], [role="textbox"], textarea');
            for (const input of textInputs) {
              if (input.offsetHeight > 0 || input.innerText.includes('Message...')) {
                this.log('Found text input in container/dialog');
                return input;
              }
            }
          }
        }

        // Last ditch: Search entire document if we are sure a message is open
        const broadInput = document.querySelector('div[contenteditable="true"][aria-label="Message"], div.xzsf02u');
        if (broadInput && broadInput.offsetHeight > 0) {
            this.log('Found message input via broad document search');
            return broadInput;
        }

        attempts++;
        if (attempts < maxAttempts) {
          this.log(`⏳ Message input in popup not found, retrying in 2s... (${attempts}/${maxAttempts})`);
          await this.sleep(2000);
        }
      }

      this.log('No message input found in popup after all retries');
      return null;
    }

    // New method to find send button in popup
    async findSendButtonInPopup() {
      // Priority 1: Use remote config selectors first
      const remoteSelector = this.config?.selectors?.sendButton;
      if (remoteSelector) {
          try {
              const remoteBtn = document.querySelector(`[role="dialog"] ${remoteSelector}, .popup ${remoteSelector}`);
              if (remoteBtn && (remoteBtn.offsetHeight > 0 || remoteBtn.offsetWidth > 0)) {
                  this.log(`✅ Found send button via remote config in popup: ${remoteSelector}`);
                  return remoteBtn;
              }
          } catch (e) {}
      }
        
      const popupSendSelectors = [
        'div[role="button"][aria-label="Send"]',
        'div[role="button"][aria-label="Enter"]',
        '[role="dialog"] button[type="submit"]',
        '[role="dialog"] [aria-label*="Send"]',
        '[role="dialog"] [aria-label*="Enter"]',
        'button.x1i1rx1s',
        '.message-popup button[type="submit"]'
      ];

      for (const selector of popupSendSelectors) {
        try {
          const button = document.querySelector(selector);
          if (button && (button.offsetHeight > 0 || button.offsetWidth > 0)) {
            this.log(`✅ Found send button in popup: ${selector}`);
            return button;
          }
        } catch (e) {}
      }

      const dialogs = document.querySelectorAll('[role="dialog"], .popup, [class*="modal"], [data-pagelet*="Message"]');
      for (const dialog of dialogs) {
        if (dialog.offsetHeight > 0 || dialog.offsetWidth > 0) {
          const buttons = dialog.querySelectorAll('button, div[role="button"]');
          for (const button of buttons) {
            const text = button.textContent?.toLowerCase()?.trim();
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase();
            
            if ((text?.includes('send') || ariaLabel?.includes('send') || text === 'enter' || ariaLabel === 'enter') && 
                (button.offsetHeight > 0 || button.offsetWidth > 0)) {
              this.log('Found send button in container');
              return button;
            }
          }
          
          // Try SVG search within this dialog
          const svgBtn = await this.findSendButtonBySVG(dialog);
          if (svgBtn) return svgBtn;

          // Try Heuristic search within this dialog
          const heuristicBtn = await this.findSendButtonByHeuristic(dialog);
          if (heuristicBtn) return heuristicBtn;
        }
      }

      // Last ditch: Search entire document via SVG if we are sure we are in a popup flow
      const globalSvgBtn = await this.findSendButtonBySVG(document);
      if (globalSvgBtn) return globalSvgBtn;

      console.log('❌ No send button found in popup');
      return null;
    }

    async waitForProfileLoad() {
      let attempts = 0;
      const maxAttempts = 30; // Was 20, increased to 30 for slower connections
      
      while (attempts < maxAttempts) {
        // --- Robust Profile Load Detection ---
        // Instagram's DOM is highly dynamic. We check multiple indicators
        // to determine if a profile page has sufficiently loaded.

        // 1. Specific IG data-testid (legacy but still present sometimes)
        const hasDataTestid = !!document.querySelector('[data-testid="user-detail-header"]');
        
        // 2. Presence of a header section (most profiles have a top header block)
        const hasHeader = !!document.querySelector('header section, header div');
        
        // 3. Presence of an follow/unfollow/message button area
        const hasActionButtons = !!document.querySelector('header button, header div[role="button"]');
        
        // 4. Presence of profile image
        const hasProfileImage = !!document.querySelector('img[alt*="profile"], img[alt*="Photo"], header img');
        
        // 5. URL check (must be a profile URL /username/)
        const isProfileUrl = /instagram\.com\/[^\/]+\/?$/.test(window.location.href);

        // 6. Check if body has substantial content (not just a blank page)
        const hasContent = document.body && document.body.innerText.length > 500;

        // Log debugging info
        if (attempts % 5 === 0) {
          this.log(`⏳ waitForProfileLoad [${attempts}/${maxAttempts}] ` +
                   `DataTestid:${hasDataTestid} ` +
                   `Header:${hasHeader} ` +
                   `Buttons:${hasActionButtons} ` +
                   `Img:${hasProfileImage} ` +
                   `URL:${isProfileUrl} ` +
                   `ContentLen:${document.body?.innerText?.length || 0}`);
        }

        // Decision: We require 
        //   - A profile URL, 
        //   - Some content loaded, 
        //   - At least TWO of the structural indicators
        const indicators = [hasDataTestid, hasHeader, hasActionButtons, hasProfileImage].filter(Boolean).length;
        
        if (isProfileUrl && hasContent && indicators >= 2) {
          this.log('Profile page loaded successfully (based on multiple indicators)');
          return true;
        }
        
        // If the page is mostly blank but the URL is correct, we might be on a 
        // restricted/suspended account. Give it a few more tries, then proceed anyway.
        if (attempts >= (maxAttempts - 5) && isProfileUrl) {
           this.log('WARNING: Profile page detected but content is sparse. Proceeding cautiously.');
           return true;
        }
        
        await this.sleep(500);
        attempts++;
      }
      
      this.log('Profile load timeout. Proceeding with execution despite timeout.', 'warning');
      return true; // DO NOT return false. This was blocking campaign execution.
    }

    async navigateToProfile(username) {
      const targetUrl = `https://www.instagram.com/${username}/`;
      
      if (window.location.href !== targetUrl) {
        console.log('🔄 Navigating to profile:', targetUrl);
        window.location.href = targetUrl;
        
        // Wait for navigation to complete
        return new Promise((resolve) => {
          const checkLoaded = () => {
            if (window.location.href === targetUrl && document.readyState === 'complete') {
              console.log('✅ Navigation completed');
              setTimeout(resolve, 2000); // Additional wait for dynamic content
            } else {
              setTimeout(checkLoaded, 500);
            }
          };
          checkLoaded();
        });
      } else {
        console.log('📍 Already on target profile page');
      }
    }

    async followUser() {
      try {
        this.log('Looking for follow button...');
        
        // Wait for page to stabilize
        await this.sleep(2000);
        
        let followButton = null;
        let attempts = 0;
        const maxAttempts = 5;

        // Try different approaches to find the follow button
        while (!followButton && attempts < maxAttempts) {
          attempts++;
          this.log(`🔍 Follow button search attempt ${attempts}/${maxAttempts}`);

          // Get all candidate buttons
          const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
          
          this.log(`🔎 Found ${allButtons.length} total buttons on page. Scanning candidates...`);

          followButton = allButtons.find(btn => {
            const text = btn.textContent?.toLowerCase()?.replace(/\s+/g, ' ').trim() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            const isVisible = btn.offsetWidth > 0 && btn.offsetHeight > 0;
            
            // Debug log for likely candidates
            if (text.includes('follow') || ariaLabel.includes('follow')) {
              this.log(`👀 Candidate button: Text="${text}", Label="${ariaLabel}", Visible=${isVisible}, Disabled=${btn.disabled}`);
            }

            if (!isVisible) return false;

            // Exclude negative states. text.startsWith('following') is the
            // only correct check because IG concatenates the SVG label to the
            // span text with NO separator (e.g. "followingdown chevron icon").
            // "follow" and "follow back" are strictly shorter than "following",
            // so they correctly do NOT match startsWith('following').
            if (text.startsWith('following') || text.startsWith('requested')) return false;
            if (text === 'message' || text === 'unfollow' || text.startsWith('unfollow')) return false;
            if (ariaLabel === 'following' || ariaLabel === 'requested' ||
                ariaLabel === 'message' || ariaLabel === 'unfollow') return false;

            // Match "Follow" or "Follow Back" as a clickable follow button.
            const isFollowText = text === 'follow' || text === 'follow back' ||
                                 text === 'followback' || text.startsWith('follow ');
            const isFollowLabel = ariaLabel === 'follow' || ariaLabel === 'follow back' ||
                                  ariaLabel === 'followback' ||
                                  (ariaLabel.startsWith('follow ') && !ariaLabel.startsWith('following '));

            return (isFollowText || isFollowLabel) && !btn.disabled;
          });

          if (followButton) {
            this.log(`✅ Found follow button: ${followButton.textContent}`);
            break;
          }

          // Method 2: Header specific search (common on mobile view or narrow width)
          const headerButtons = document.querySelectorAll('header button');
          followButton = Array.from(headerButtons).find(btn => {
            const text = btn.textContent?.toLowerCase()?.trim();
            this.log(`👀 Header button check: "${text}"`);
            return (text === 'follow' || text === 'follow back') && btn.offsetWidth > 0;
          });

          if (followButton) {
            this.log('Found follow button in header');
            break;
          }

          this.log(`❌ Follow button not found in attempt ${attempts}`);
          await this.sleep(1000);
        }

        if (!followButton) {
          // Double check if already following using a more robust check
          const isFollowing = await this.checkIfFollowing();
          if (isFollowing) {
            this.log('Already following (detected via status check)');
            return { success: true, action: 'already_following', wasAlreadyFollowing: true };
          }

          // Give the header one more chance to render before giving up.
          // On SPA navigation the action button area can arrive a few seconds late.
          this.log('Follow button not found, waiting for action area to render...');
          for (let i = 0; i < 4; i++) {
            await this.sleep(1000);
            const lateButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
            const lateFollow = lateButtons.find(btn => {
              if (!(btn.offsetWidth > 0 && btn.offsetHeight > 0)) return false;
              const text = (btn.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
              const label = (btn.getAttribute('aria-label') || '').toLowerCase();
              if (text === 'following' || text === 'requested' || label === 'following' || label === 'requested') return false;
              return (text === 'follow' || text === 'follow back' || label === 'follow' || label === 'follow back');
            });
            if (lateFollow) {
              this.log(`✅ Follow button found after extra wait (attempt ${i + 1})`);
              followButton = lateFollow;
              break;
            }
            const isFollowingLate = await this.checkIfFollowing();
            if (isFollowingLate) {
              this.log('Already following (detected after extra wait)');
              return { success: true, action: 'already_following', wasAlreadyFollowing: true };
            }
          }

          if (!followButton) {
            this.log('WARNING: Cannot find follow button and not following');
            return { success: false, reason: 'Follow button not found' };
          }
        }
        
        // Click the follow button
        this.log('Clicking follow button...');
        await this.simulateHumanClick(followButton);
        
        // Verification loop with retry
        let verifyAttempts = 0;
        let isNowFollowing = false;
        
        while (verifyAttempts < 3) {
          // Wait longer for Instagram to process (user reported it takes a few seconds)
          this.log(`⏳ Waiting for follow status update (Attempt ${verifyAttempts + 1})...`);
          await this.humanDelay(4000, 6000);
          
          isNowFollowing = await this.checkIfFollowing();
          
          if (isNowFollowing) {
            break;
          }
          
          this.log(`⚠️ Follow status not updated. Retrying click...`);
          
          // Find button again in case DOM refreshed
          const retryButton = Array.from(document.querySelectorAll('button')).find(btn => 
            (btn.textContent?.toLowerCase() === 'follow' || btn.textContent?.toLowerCase() === 'follow back') && 
            btn.offsetWidth > 0
          );
          
          if (retryButton) {
            if (verifyAttempts === 1) {
               // On second retry, try standard click as fallback
               this.log('Trying standard .click() fallback...');
               retryButton.click();
            } else {
               await this.simulateHumanClick(retryButton);
            }
          }
          
          verifyAttempts++;
        }
        
        return { 
          success: isNowFollowing, 
          action: isNowFollowing ? 'followed' : 'follow_failed',
          reason: isNowFollowing ? null : 'Status did not change to Following/Requested after retries'
        };

      } catch (error) {
        this.log(`💥 Follow error: ${error.message}`, 'error');
        return { success: false, reason: error.message };
      }
    }

    // NEW: Check if a profile is a private account
    // Uses multiple heuristics: lock icon, private text indicators, request button labels
    async isPrivateAccount() {
      this.log('Checking if account is private...');

      // Heuristic 1: Look for a lock icon (lock svg or lock emoji)
      const lockKeywords = ['lock', 'private', 'private account'];
      const hasLockIcon = Array.from(document.querySelectorAll('svg, span, div')).some(el => {
        const text = el.textContent?.toLowerCase() || '';
        const iconAttr = el.getAttribute('aria-label')?.toLowerCase() || '';
        return lockKeywords.some(k => text.includes(k) || iconAttr.includes(k));
      });
      if (hasLockIcon) {
        this.log('Detected private account (lock icon found)');
        return true;
      }

      // Heuristic 2: Look for any button with 'request' in the text or aria-label
      const requestKeywords = ['request', 'solicitud', 'request to follow'];
      const hasRequestButton = Array.from(document.querySelectorAll('button, div[role="button"]')).some(btn => {
        const text = btn.textContent?.toLowerCase()?.trim() || '';
        const label = btn.getAttribute('aria-label')?.toLowerCase()?.trim() || '';
        return requestKeywords.some(keyword => text.includes(keyword) || label.includes(keyword));
      });
      if (hasRequestButton) {
        this.log('Detected private account ("Request" button found)');
        return true;
      }

      // Heuristic 3: Check if the follow button is a "Requested" state (private + already requested)
      const followBtn = document.querySelector('button, div[role="button"]');
      if (followBtn) {
        const btnText = followBtn.textContent?.toLowerCase()?.trim() || '';
        if (btnText === 'requested') {
          this.log('Detected private account ("Requested" button found)');
          return true;
        }
      }

      // Heuristic 4: Look for "This Account is Private" text anywhere in the document
      const bodyText = document.body?.textContent?.toLowerCase() || '';
      if (bodyText.includes('this account is private')) {
        this.log('Detected private account ("This Account is Private" text found)');
        return true;
      }

      // Not detected as private
      return false;
    }

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async checkIfFollowing() {
      this.log('Starting follow status check...');
      await this.sleep(1000);
      
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"]'));
      this.log(`🔎 Scanning ${buttons.length} elements for follow status indicators...`);
      
      let hasFollowingText = false;
      let hasRequestedText = false;
      
      // Instagram's modern profile UI renders the follow state button as:
      //   <div role="button">
      //     <span>Following</span>
      //     <svg ...><title>down chevron icon</title>...</svg>
      //   </div>
      // The browser's textContent concatenates with NO whitespace between the
      // span text and the SVG's <title>/text — producing literally
      // "Followingdown chevron icon". This breaks:
      //   - text === 'following'   (extra "down chevron icon")
      //   - text.startsWith('following ')  (no space, immediately "d")
      //   - text.split(' ')[0] === 'following'  (split[0] === "followingdown")
      //   - length-aware prefix with 10th-char check  (10th char IS "d", a letter)
      //
      // The simplest rule that works in ALL cases:
      //   text.startsWith('following')  → state button
      //   text === 'follow' / 'follow back' / startsWith('follow ') → Follow button
      // Because "follow" is strictly shorter than "following", `startsWith('following')`
      // is naturally false for "follow" and "follow back", so this is unambiguous.
      const isFollowingState = (t) => t.startsWith('following');
      const isRequestedState = (t) => t.startsWith('requested');

      const matchesFollowing = (el) => {
        const label = (el.getAttribute('aria-label') || '').toLowerCase().trim();
        if (label === 'following' || label.startsWith('following ')) return true;
        const text = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        return isFollowingState(text);
      };
      const matchesRequested = (el) => {
        const label = (el.getAttribute('aria-label') || '').toLowerCase().trim();
        if (label === 'requested' || label.startsWith('requested ')) return true;
        const text = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        return isRequestedState(text);
      };
      const isVisible = (el) => el.offsetWidth > 0 && el.offsetHeight > 0;
      
      for (const btn of buttons) {
        if (!isVisible(btn)) continue;
        
        // Check button itself
        if (matchesFollowing(btn)) {
          hasFollowingText = true;
          this.log(`Detected "Following" status (text="${(btn.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 40)}")`);
        }
        if (matchesRequested(btn)) {
          hasRequestedText = true;
          this.log(`Detected "Requested" status (text="${(btn.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 40)}")`);
        }
        
        // Walk up to 3 ancestors looking for aria-label-only state
        if (!hasFollowingText && !hasRequestedText) {
          let ancestor = btn.parentElement;
          let depth = 0;
          while (ancestor && depth < 3 && ancestor !== document.body) {
            if (isVisible(ancestor)) {
              const aLabel = (ancestor.getAttribute('aria-label') || '').toLowerCase().trim();
              if (!hasFollowingText && (aLabel === 'following' || aLabel.startsWith('following '))) {
                hasFollowingText = true;
                this.log('Detected "Following" status via parent aria-label');
              }
              if (!hasRequestedText && (aLabel === 'requested' || aLabel.startsWith('requested '))) {
                hasRequestedText = true;
                this.log('Detected "Requested" status via parent aria-label');
              }
            }
            if (hasFollowingText || hasRequestedText) break;
            ancestor = ancestor.parentElement;
            depth++;
          }
        }
        
        if (hasFollowingText || hasRequestedText) break;
      }
      
      const isFollowing = hasFollowingText || hasRequestedText;
      this.log(`📊 Follow check results: following=${hasFollowingText}, requested=${hasRequestedText} -> Final: ${isFollowing}`);
      
      return isFollowing;
    }

    async sendDirectMessage(username, message) {
      try {
        console.log('💬 Starting message flow...');
        
        // First, try to find the message button on the profile
        const messageButton = await this.findMessageButton();
        
        if (messageButton) {
          console.log('✅ Found message button on profile');
          await this.simulateHumanClick(messageButton);
          await this.humanDelay(2000, 4000);
        } else {
          console.log('❌ No message button on profile, navigating to DMs...');
          // Navigate to direct messages
          await this.navigateToDirectMessages();
          await this.humanDelay(2000, 4000);

          // Start new conversation
          const conversationStarted = await this.startNewConversation(username);
          if (!conversationStarted) {
            return { success: false, reason: 'Could not start conversation' };
          }
        }

        await this.humanDelay(1000, 3000);

        // Handle "Accept" prompt if it exists
        await this.handleMessageRequestAccept();
        
        // Handle "Move to General" prompt if it appears after accepting
        await this.handleMoveMessageToGeneral();

        // Type and send message
        console.log('⌨️ Looking for message input...');
        const messageInput = await this.findMessageInput();
        if (!messageInput) {
          return { success: false, reason: 'Message input not found' };
        }

        console.log('⌨️ Typing message...');
        await this.typeHumanLike(messageInput, message);
        await this.humanDelay(1000, 2000);

        // Send message
        console.log('📤 Looking for send button...');
        const sendButton = await this.findSendButton();
        if (!sendButton) {
          return { success: false, reason: 'Send button not found' };
        }

        console.log('📤 Sending message...');
        await this.simulateHumanClick(sendButton);
        await this.humanDelay(1000, 2000);
        
        return { success: true, action: 'message_sent' };

      } catch (error) {
        console.error('💥 Message error:', error);
        return { success: false, reason: error.message };
      }
    }

    async findMessageButton() {
      this.log('Searching for Message button...');
      const buttons = document.querySelectorAll('button, div[role="button"], a[role="button"]');
      
      this.log(`🔎 Found ${buttons.length} total potential buttons. Scanning for "Message"...`);
      
      const messageButton = Array.from(buttons).find(btn => {
        const text = btn.textContent?.toLowerCase()?.trim() || '';
        const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
        const isVisible = btn.offsetWidth > 0 && btn.offsetHeight > 0;
        
        if (text.includes('message') || label.includes('message')) {
          this.log(`👀 Found candidate: Text="${text}", Label="${label}", Visible=${isVisible}`);
        }
        
        return (text === 'message' || label === 'message') && isVisible;
      });
      
      if (messageButton) {
        this.log('Found message button successfully');
      } else {
        this.log('No message button found with exact match, trying partial match...');
        // Fallback to partial match if exact match fails
        const partialMatch = Array.from(buttons).find(btn => {
          const text = btn.textContent?.toLowerCase()?.trim() || '';
          return text.includes('message') && btn.offsetWidth > 0;
        });
        
        if (partialMatch) {
          this.log('Found message button via partial text match');
          return partialMatch;
        }
      }
      
      return messageButton;
    }

    async navigateToDirectMessages() {
      const dmUrl = 'https://www.instagram.com/direct/inbox/';
      
      if (!window.location.href.includes('/direct/')) {
        console.log('🔄 Navigating to direct messages...');
        window.location.href = dmUrl;
        
        return new Promise((resolve) => {
          const checkLoaded = () => {
            if (window.location.href.includes('/direct/') && document.readyState === 'complete') {
              console.log('✅ Direct messages loaded');
              setTimeout(resolve, 2000);
            } else {
              setTimeout(checkLoaded, 500);
            }
          };
          checkLoaded();
        });
      }
    }

    async startNewConversation(username) {
      try {
        console.log('💬 Looking for new message button...');
        
        // Look for "Send message" or "New message" button
        let newMessageButton = null;
        let attempts = 0;
        
        while (!newMessageButton && attempts < 3) {
          attempts++;
          
          const buttons = document.querySelectorAll('button, [role="button"]');
          newMessageButton = Array.from(buttons).find(el => {
            const text = el.textContent?.toLowerCase();
            const ariaLabel = el.getAttribute('aria-label')?.toLowerCase();
            const isVisible = el.offsetHeight > 0;
            return ((text?.includes('new message') || text?.includes('send message') || 
                     ariaLabel?.includes('new message')) && isVisible);
          });
          
          if (!newMessageButton) {
            // Look for SVG icons that might represent new message
            const svgElements = document.querySelectorAll('svg');
            const parentButton = Array.from(svgElements).find(svg => {
              const ariaLabel = svg.getAttribute('aria-label')?.toLowerCase();
              return ariaLabel?.includes('new message');
            })?.closest('button');
            
            if (parentButton) {
              newMessageButton = parentButton;
            }
          }
          
          if (!newMessageButton) {
            console.log(`❌ New message button not found (attempt ${attempts})`);
            await this.sleep(1000);
          }
        }

        if (newMessageButton) {
          console.log('✅ Found new message button');
          await this.simulateHumanClick(newMessageButton);
          await this.humanDelay(1000, 2000);

          // Type username in search
          const searchInput = await this.waitForElement('input[placeholder*="Search"], input[placeholder*="search"]', 5000);
          if (searchInput) {
            console.log('✅ Found search input');
            await this.typeHumanLike(searchInput, username);
            await this.humanDelay(1500, 2500);

            // Click on first search result
            const searchResults = document.querySelectorAll('[role="button"], div[role="button"]');
            let userResult = null;
            
            for (const result of searchResults) {
              if (result.textContent?.toLowerCase().includes(username.toLowerCase()) || 
                  result.textContent?.includes('@')) {
                userResult = result;
                break;
              }
            }
            
            if (userResult) {
              console.log('✅ Found user in search results');
              await this.simulateHumanClick(userResult);
              await this.humanDelay(500, 1000);

              // Click "Chat" or "Next" button
              const proceedButtons = document.querySelectorAll('button');
              const nextButton = Array.from(proceedButtons).find(btn => {
                const text = btn.textContent?.toLowerCase()?.trim();
                return ['chat', 'next'].includes(text);
              });
              
              if (nextButton) {
                console.log('✅ Found proceed button');
                await this.simulateHumanClick(nextButton);
                await this.humanDelay(1000, 2000);
                return true;
              } else {
                console.log('⚠️ No proceed button found');
              }
            } else {
              console.log('❌ User not found in search results');
            }
          } else {
            console.log('❌ Search input not found');
          }
        }

        return false;
      } catch (error) {
        console.error('💥 Error starting conversation:', error);
        return false;
      }
    }

    async findMessageInput() {
      this.log('Searching for message input...');
      
      let attempts = 0;
      while (attempts < 3) {
        // Merge remote config selectors with defaults
        const inputSelectors = [
          ...(this.config?.selectors?.messageInput ? [this.config.selectors.messageInput] : []),
          'div[contenteditable="true"][aria-label*="Message"]',
          'div.xzsf02u[contenteditable="true"]',
          '[aria-placeholder="Message..."]',
          '[data-testid="message-input"]',
          'div[role="textbox"][contenteditable="true"]',
          'textarea[placeholder*="message"]',
          'div[contenteditable="true"]',
          '[aria-label*="Message"]',
          'textarea[aria-label*="Message"]',
          'div[role="textbox"]'
        ];

        for (const selector of inputSelectors) {
          try {
            const input = document.querySelector(selector);
            if (input && (input.offsetHeight > 0 || input.offsetWidth > 0)) {
              this.log(`✅ Found message input: ${selector}`);
              return input;
            }
          } catch (e) {}
        }

        // Look more broadly
        const textareas = document.querySelectorAll('textarea, div[contenteditable="true"], div[role="textbox"]');
        const messageInput = Array.from(textareas).find(el => el.offsetHeight > 0);
        
        if (messageInput) {
          // Additional check: Ensure it's not disabled/hidden/inert
          if (messageInput.disabled || messageInput.offsetParent === null) {
               this.log('Found input but it seems disabled/hidden, waiting...', 'warning');
               continue; // Retry
          }
          this.log('Found message input (broad search)');
          return messageInput;
        }

        attempts++;
        if (attempts < 3) {
          this.log(`⏳ Message input not found, retrying in 1s... (${attempts}/3)`);
          await this.sleep(1000);
        }
      }

      this.log('No message input found after retries');
      return null;
    }

    async findSendButtonBySVG(scopeElement = document) {
      this.log('Searching for Send button by SVG fingerprint...');
      // Use dynamic configuration for the icon path
      const sendIconPathStart = this.config.sendIconPath; 
      
      try {
        const allPaths = scopeElement.querySelectorAll('path');
        let anchorSvg = null;

        for (const path of allPaths) {
          const d = path.getAttribute('d');
          if (d && d.startsWith(sendIconPathStart)) {
              anchorSvg = path.closest('svg');
              this.log('Found Send icon SVG');
              break;
          }
        }

        if (!anchorSvg) return null;

        // Traverse up to find the clickable parent
        let candidate = anchorSvg.parentElement;
        let depth = 0;
        while (candidate && candidate !== document.body && depth < 5) {
            const role = candidate.getAttribute('role');
            const tagName = candidate.tagName;
            
            if (role === 'button' || tagName === 'BUTTON') {
                if (candidate.offsetHeight > 0 || candidate.offsetWidth > 0) {
                    this.log(`✅ Found clickable parent via SVG: ${tagName}.${candidate.className.substring(0, 20)}...`);
                    return candidate;
                }
            }
            candidate = candidate.parentElement;
            depth++;
        }
      } catch (e) {
        this.log('WARNING: Error in SVG search: ' + e.message);
      }
      return null;
    }

    async findSendButtonByHeuristic(scopeElement = document) {
      this.log('Searching for Send button by Heuristic (Context)...');
      
      // 1. Find the Anchor (The Input Field)
      // We reuse our robust input finder logic, checking the scope
      let input = null;
      if (scopeElement === document) {
          input = await this.findMessageInput();
      } else {
          // Simple search within scope
          input = scopeElement.querySelector('div.xzsf02u, [contenteditable="true"], textarea');
      }

      if (!input) {
          this.log('WARNING: Heuristic failed: Could not find input anchor.');
          return null;
      }

      // 2. Traverse up to find the "Composer" container
      // The Send button is usually a sibling or cousin in the DOM tree
      let container = input.parentElement;
      let attempts = 0;
      const maxLevels = 5; // Go up 5 levels max

      while (container && container !== document.body && attempts < maxLevels) {
          // Check if this container has buttons
          const buttons = Array.from(container.querySelectorAll('div[role="button"], button'));
          
          // Filter for VISIBLE buttons that are NOT the input itself
          const visibleButtons = buttons.filter(btn => {
              return btn !== input && 
                     (btn.offsetWidth > 0 || btn.offsetHeight > 0) &&
                     !btn.contains(input); // Ensure button doesn't contain the input
          });

          if (visibleButtons.length > 0) {
              // 3. Logic: The Send button is usually the LAST visible action in the composer
              // (e.g. [Input] [Mic] [Image] [SEND])
              const candidate = visibleButtons[visibleButtons.length - 1];
              
              this.log(`✅ Found candidate via Heuristic (Last Button): ${candidate.tagName}.${candidate.className.substring(0, 15)}...`);
              return candidate;
          }

          container = container.parentElement;
          attempts++;
      }
      return null;
    }

    async findSendButton() {
      // Logical search order: remote config -> standard selectors -> advanced heuristics
      const searchMethods = [
        { name: 'Remote Config', method: async () => {
          if (!this.config?.selectors?.sendButton) return null;
          const el = document.querySelector(this.config.selectors.sendButton);
          return (el && (el.offsetHeight > 0 || el.offsetWidth > 0)) ? el : null;
        }},
        { name: 'Standard Selectors', method: async () => {
          const selectors = [
            'div[role="button"][aria-label="Send"]', 
            'div[role="button"][aria-label="Enter"]', 
            'button[type="submit"]', 
            '[aria-label="Send"]', 
            'button.x1i1rx1s'
          ];
          for (const s of selectors) {
            const el = document.querySelector(s);
            if (el && (el.offsetHeight > 0 || el.offsetWidth > 0)) return el;
          }
          return null;
        }},
        { name: 'SVG Fingerprint', method: () => this.findSendButtonBySVG() },
        { name: 'Heuristic Search', method: () => this.findSendButtonByHeuristic() }
      ];

      for (const { name, method } of searchMethods) {
        try {
          const button = await method();
          if (button) {
            this.log(`✅ Found send button via ${name}`);
            return button;
          }
        } catch (e) {
          this.log(`⚠️ ${name} search failed: ${e.message}`);
        }
      }

      this.log('No send button found with any method');
      return null;
    }

    // Simulate human typing with variable delays and occasional pauses
    async typeHumanLike(element, text, settings = {}) {
      const charDelayMin = settings.charDelay?.min || 50;
      const charDelayMax = settings.charDelay?.max || 100;
      const pauseChance = settings.pauseChance || 0.05;
      const pauseDelayMin = settings.pauseDelay?.min || 200;
      const pauseDelayMax = settings.pauseDelay?.max || 500;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        // Focus the element first
        element.focus();
        
        // Simulate keydown
        element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        
        // Insert character
        if (element.isContentEditable) {
          document.execCommand('insertText', false, char);
        } else {
          element.value += char;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Simulate keyup
        element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        
        // Random delay between characters
        const delay = Math.random() * (charDelayMax - charDelayMin) + charDelayMin;
        await this.sleep(delay);
        
        /** 
         * MIMIC PAUSES: Occasional brief stop in typing to appear more human.
         * Configurable via pauseChance. 
         */
        if (Math.random() < pauseChance) {
          const pauseDuration = Math.random() * (pauseDelayMax - pauseDelayMin) + pauseDelayMin;
          this.log(`😴 Mimicking human pause for ${pauseDuration}ms...`);
          await this.sleep(pauseDuration);
        }
      }
    }

    // Simulate a human mouse click with small random offsets and a brief hold
    async simulateHumanClick(element) {
      const rect = element.getBoundingClientRect();
      
      // Random click within the element
      const x = rect.left + (Math.random() * rect.width);
      const y = rect.top + (Math.random() * rect.height);
      
      // Mouse down
      element.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: x,
        clientY: y
      }));
      
      // Brief hold (human hesitation)
      await this.sleep(Math.random() * 100 + 50);
      
      // Mouse up / click
      element.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        clientX: x,
        clientY: y
      }));
      
      element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: x,
        clientY: y
      }));
    }

    // Wait for an element with timeout and polling
    async waitForElement(selector, timeout = 10000) {
      const start = Date.now();
      
      while (Date.now() - start < timeout) {
        const element = document.querySelector(selector);
        if (element && (element.offsetHeight > 0 || element.offsetWidth > 0)) {
          return element;
        }
        await this.sleep(500);
      }
      
      return null;
    }

    // Wait for navigation to a specific URL
    async waitForNavigation(targetUrl, timeout = 10000) {
      const start = Date.now();
      
      while (Date.now() - start < timeout) {
        if (window.location.href === targetUrl) {
          return true;
        }
        await this.sleep(500);
      }
      
      return false;
    }

    // Generate a random delay between min and max milliseconds
    async humanDelay(min, max) {
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      this.log(`⏳ Waiting ${delay}ms...`);
      await this.sleep(delay);
    }

    // Remote Healing: Fetch updated selectors from Google Apps Script
    async initiateRemoteHealing() {
      this.log('Initiating remote healing...');
      
      try {
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
          this.log('Cannot contact background script for healing');
          return false;
        }

        // Capture the current page's relevant HTML for context
        const htmlSnapshot = this.capturePageHTML();
        
        const response = await chrome.runtime.sendMessage({
          type: 'FETCH_REMOTE_CONFIG',
          html: htmlSnapshot
        });

        if (response && response.success && response.data) {
          this.log('Received healing configuration');
          
          // Apply the new configuration
          this.config = { ...this.config, ...response.data };
          
          // Save to local storage for persistence
          await chrome.storage.local.set({ remoteConfig: response.data });
          
          this.log(`🌍 Updated config: ${JSON.stringify(response.data)}`);
          return true;
        } else {
          this.log('WARNING: Healing response invalid or unsuccessful');
          return false;
        }

      } catch (error) {
        this.log(`💥 Remote healing error: ${error.message}`, 'error');
        return false;
      }
    }

    capturePageHTML() {
      try {
        // Sanitize the DOM: Remove scripts and sensitive elements
        const clone = document.body.cloneNode(true);
        const scripts = clone.querySelectorAll('script');
        scripts.forEach(script => script.remove());
        
        // Remove sensitive elements
        const sensitive = clone.querySelectorAll('input[type="password"], input[name*="card"], input[name*="cvv"]');
        sensitive.forEach(el => {
          el.value = '***REDACTED***';
          el.setAttribute('type', 'text');
        });
        
        // Limit size to prevent excessive payload
        const html = clone.outerHTML;
        if (html.length > 50000) {
          return html.substring(0, 50000) + `... (truncated from ${html.length} chars)`;
        }
        return html;
      } catch (e) {
        console.error('Error capturing HTML:', e);
        return '<html>Error capturing</html>';
      }
    }

    async sleep(ms) {
      // Use background script for delays to prevent throttling
      if (chrome.runtime && chrome.runtime.sendMessage) {
         try {
           await chrome.runtime.sendMessage({
             type: 'DELAY_REQUEST',
             duration: ms
           });
           return; 
         } catch (e) {
           // Fallback to local timeout if background is unreachable
         }
      }
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // ==============================
  //  END OF CLASS DEFINITION
  // ==============================

  // Global guard check (in case IIFE runs multiple times somehow)
  if (typeof window.instagramAutomator === 'undefined') {
    try {
      window.instagramAutomator = new InstagramAutomator();
      console.log('[DM Auto] Initialized successfully');
    } catch (e) {
      console.error('[DM Auto] Failed to init automator:', e);
    }
  } else {
    console.log('[DM Auto] Automator already initialized.');
  }

  // Make the class available for any external callers that need it
  window.InstagramAutomator = InstagramAutomator;

})();
