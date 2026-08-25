# Instagram DM Automation Pro - Browser Extension

A powerful browser extension that automates Instagram direct messages and follows with human-like behavior patterns.

## ✨ What's New in v1.0.1

- **Fixed Connection Issues**: Improved Instagram login detection
- **New Tab Dashboard**: Opens in a dedicated tab instead of popup 
- **Better Error Handling**: More detailed connection status and troubleshooting
- **Enhanced UI**: Improved design and user experience
- **Auto Instagram Opener**: Quick button to open Instagram and login

## ⚠️ CRITICAL: Account Verification

**BEFORE USING THIS EXTENSION:**

### 🔐 Account Safety Check
1. **Verify YOUR Account**: When you first connect, the extension will ask you to confirm the detected username
2. **Wrong Account Alert**: If it detects a different user's account, it will guide you to fix this
3. **Double-Check**: Always verify the "Connected as @username" shows YOUR actual Instagram username
4. **Never Skip**: Don't skip the account verification prompts - they prevent sending messages from wrong accounts

### 🚨 What to Do if Wrong Account is Detected:
1. Click "Switch Account" button in the dashboard
2. Or manually go to Instagram.com → Log out → Log in to your correct account
3. Return to dashboard and click the refresh button (↻)
4. Verify it now shows YOUR username
5. Use "Verify Account" button to double-check

### ✅ Before Starting ANY Campaign:
- ✅ Confirm the username shown is YOUR Instagram account
- ✅ Click "Verify Account" to double-check
- ✅ Test with 1-2 leads first
- ✅ Make sure messages appear in YOUR Instagram DMs

## 🚀 Features

- **Automated Following**: Follow users from your lead list
- **Direct Message Automation**: Send personalized DMs 
- **Human-like Behavior**: Random delays and natural interaction patterns
- **Safety First**: Built-in rate limiting and account protection
- **Real-time Analytics**: Track campaign performance and success rates
- **Lead Management**: CSV upload and manual lead entry
- **Message Personalization**: Dynamic variables for custom messages
- **Smart Connection Detection**: Automatically detects Instagram login status

## 📥 Installation

1. **Download/Clone** this repository to your computer
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in top right corner)
4. **Click "Load unpacked"** and select the extension folder
5. **Pin the extension** to your Chrome toolbar for easy access

## 🔧 Quick Setup

1. **Click the extension icon** in your Chrome toolbar
2. **Dashboard opens** in a new tab automatically
3. **Click "Open Instagram"** if you need to login
4. **Login to Instagram** in the opened tab
5. **Return to dashboard** and click the refresh button (↻)
6. **Verify connection** shows "Connected as @yourusername"

### 🔍 How Account Detection Works:
The extension looks for:
1. **Your profile link in the navigation bar** (most reliable)
2. **"Edit Profile" button** on profile pages (indicates your own profile)
3. **Your username in page metadata**
4. **Account settings and navigation elements**

It specifically avoids:
- ❌ Usernames from the Instagram feed
- ❌ Other users' profiles you're viewing
- ❌ Suggested or sponsored accounts

## 📝 Step-by-Step Usage

### 1. Connection Setup
- The dashboard will show connection status at the top
- If disconnected, click "Open Instagram" to login
- After logging in, click the refresh button (↻) next to the status
- You should see "Connected as @yourusername"

### 2. Load Your Leads
- Go to the **Leads** tab
- **Option A**: Upload a CSV/TXT file with usernames (one per line)
- **Option B**: Manually enter usernames in the text area
- Usernames can be with or without the @ symbol
- Click "Process Leads" to validate and load them

### 3. Configure Campaign
- Go to the **Campaign** tab
- Enter a descriptive campaign name
- Customize your message template using variables:
  - `{{username}}` - Instagram username
  - `{{firstName}}` - First part of username
- Choose which actions to enable:
  - **Enable Following**: Follow users automatically
  - **Enable Messaging**: Send DMs to users
- Set daily limits (start conservative: 30-50 follows, 50-80 messages)

### 4. Start Campaign
- Click "Start Campaign" button
- Campaign runs in the background
- Monitor progress in the **Stats** tab
- Use "Stop Campaign" to pause at any time

### 5. Monitor Results
- **Stats Tab** shows real-time metrics:
  - Processed, followed, messaged counts
  - Success rates and error tracking
  - Daily activity vs. limits
- **Progress bar** shows campaign completion
- **Refresh Stats** button updates numbers

## ⚙️ Settings Configuration

### Timing Settings
- **Min Delay**: 30-60 seconds (minimum time between actions)
- **Max Delay**: 120-300 seconds (maximum time between actions)
- Start with longer delays for safety

### Advanced Options
- **Smart Delays**: AI-powered timing (recommended)
- **Skip Private**: Only target public accounts
- **Weekend Mode**: Reduce weekend activity
- **Active Hours**: Set operating time window

### Safety Recommendations
- **Start Small**: Begin with 10-20 leads for testing
- **Conservative Limits**: 30 follows, 50 messages per day initially
- **Monitor Results**: Check for any Instagram warnings
- **Gradual Increase**: Slowly raise limits based on success

## 🛠️ Troubleshooting

### "Checking connection..." stuck
1. Make sure Instagram.com is open in another tab
2. Verify you're logged into Instagram
3. Click the refresh button (↻) next to status
4. Try logging out and back into Instagram

### "Not connected" error
1. Click "Open Instagram" button
2. Login to your Instagram account
3. Return to dashboard and refresh connection
4. Make sure you're on instagram.com (not mobile version)

### Campaign not starting
1. Verify connection shows "Connected"
2. Make sure you have leads loaded
3. Enter a campaign name
4. Check that at least one action is enabled (follow or message)

### Actions not working
1. Check if Instagram interface changed
2. Look at browser console (F12) for errors
3. Try refreshing the Instagram tab
4. Restart the campaign

### Extension not working
1. Make sure you're using Chrome (other browsers not supported)
2. Check that extension is enabled in chrome://extensions/
3. Try disabling and re-enabling the extension
4. Reload Instagram and dashboard tabs

## 📊 Understanding Stats

- **Processed**: Total leads attempted
- **Followed**: Successfully followed users
- **Messaged**: Successfully sent messages
- **Errors**: Failed actions (timeouts, blocks, etc.)
- **Success Rate**: (Follows + Messages) / (Processed × 2) × 100%

## 🔒 Safety & Compliance

### Built-in Safety Features
- **Rate Limiting**: Respects Instagram's daily limits
- **Human Timing**: Random delays between actions
- **Natural Behavior**: Real DOM interaction, not automation
- **Error Recovery**: Handles failures gracefully
- **Session Monitoring**: Tracks login status

### Best Practices
- **Provide Value**: Send meaningful, relevant messages
- **Respect Users**: Stop if users ask you to
- **Stay Updated**: Monitor for Instagram policy changes
- **Be Patient**: Start slow and build gradually
- **Quality Over Quantity**: Better targeting = higher success rates

### Daily Limits (Recommended Starting Points)
- **New Accounts**: 20 follows, 30 messages
- **Established Accounts**: 30 follows, 50 messages  
- **Trusted Accounts**: 50 follows, 80 messages
- **Never Exceed**: 100 follows, 150 messages per day

## 📁 File Formats

### CSV/TXT Upload Format
```
username1
username2
@username3
another.user
user_name_4
```

### Message Template Examples
```
Hi {{firstName}}, I love your content about [topic]! Would you like to collaborate?

Hello {{firstName}}, I noticed we're both in [industry]. Let's connect!

Hey @{{username}}, your recent post was amazing! I'd love to chat about [topic].
```

## 🔄 Updates & Maintenance

The extension automatically handles:
- Instagram interface changes (when possible)
- Session management
- Error recovery
- Data persistence

Keep your extension updated by:
1. Checking for new versions regularly
2. Re-downloading if Instagram changes significantly
3. Monitoring the browser console for errors

## ⚠️ Important Notes

- **Instagram Terms**: This tool is for legitimate business outreach
- **Account Safety**: Start conservatively and monitor results
- **Success Rates**: Expect 60-80% success rates for follows, 40-60% for messages
- **Response Rates**: Typical DM response rates are 5-15%
- **Blocks/Limits**: If Instagram shows warnings, stop immediately

## 🆘 Getting Help

1. **Check Console**: Press F12 in browser, look for errors
2. **Test Manually**: Try actions manually on Instagram first
3. **Reset Extension**: Use "Reset Extension" button in Settings
4. **Update Browser**: Make sure Chrome is up to date
5. **Clear Data**: Try clearing Instagram cookies/cache

## 📋 File Structure

```
instagram-dm-automation/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker
├── content-script.js      # Instagram page automation
├── popup.html            # Dashboard interface
├── popup.js              # Dashboard functionality
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon32.png  
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This documentation
```

## 🔧 Technical Details

### How It Works
1. **Background Script**: Manages campaigns and coordinates actions
2. **Content Script**: Injects into Instagram pages for automation
3. **Dashboard**: Provides user interface and control panel
4. **Storage**: Uses Chrome's local storage for data persistence

### Permissions Used
- **activeTab**: Access current Instagram tab
- **storage**: Save campaign data and settings  
- **scripting**: Inject automation scripts
- **tabs**: Manage Instagram and dashboard tabs

### Browser Compatibility
- ✅ **Chrome 88+**: Fully supported
- ❌ **Firefox**: Not supported (uses Manifest V3)
- ❌ **Safari**: Not supported
- ❌ **Edge**: May work but not tested

## 📈 Performance Tips

### Optimize Success Rates
1. **Target Quality**: Research accounts before adding to leads
2. **Personalize Messages**: Mention specific content or interests
3. **Timing Matters**: Send messages during peak Instagram hours
4. **Follow First**: Following before messaging increases response rates
5. **Clean Leads**: Remove inactive or fake accounts

### Avoid Getting Blocked
1. **Start Slow**: Begin with very low daily limits
2. **Vary Timing**: Don't use the same delay patterns
3. **Take Breaks**: Pause campaigns periodically
4. **Monitor Engagement**: Stop if getting many unfollows/reports
5. **Quality Content**: Ensure your own profile looks professional

## 🎯 Use Cases

### Business Outreach
- Find potential customers in your niche
- Connect with industry influencers
- Build relationships with complementary businesses
- Recruit affiliates or partners

### Content Promotion
- Share new content with interested users
- Build an audience for your niche
- Connect with other content creators
- Promote events or launches

### Networking
- Connect with professionals in your field
- Build relationships at scale
- Follow up with event attendees
- Maintain contact with prospects

## 📊 Expected Results

### Typical Success Rates
- **Following**: 70-85% success rate
- **Messaging**: 50-70% delivery rate
- **Responses**: 5-15% response rate
- **Conversions**: 1-5% depending on offer

### Timeline Expectations
- **Initial Setup**: 15-30 minutes
- **Campaign Creation**: 5-10 minutes
- **Processing Speed**: 2-5 leads per hour (with safe delays)
- **Results Visible**: Within 24-48 hours

## 🔄 Version History

### v1.0.1 (Current)
- Fixed Instagram login detection
- Added new tab dashboard interface
- Improved error handling and user feedback
- Enhanced connection status monitoring
- Added quick Instagram opener button

### v1.0.0 (Initial)
- Basic following and messaging automation
- Lead management system
- Campaign statistics tracking
- Safety rate limiting features

## 🚀 Future Enhancements

Planned features for future versions:
- **Comment Automation**: Auto-comment on posts
- **Story Interactions**: View and react to stories
- **Advanced Targeting**: Filter by follower count, engagement
- **A/B Testing**: Test different message templates
- **Scheduling**: Set specific times for campaigns
- **Analytics Export**: Download campaign data

## ⚖️ Legal & Ethical Use

### Acceptable Use
✅ Legitimate business outreach
✅ Networking and relationship building
✅ Content promotion to interested audiences
✅ Professional recruitment
✅ Event promotion and follow-up

### Prohibited Use
❌ Spam or unsolicited bulk messaging
❌ Harassment or unwanted contact
❌ Fake accounts or impersonation
❌ Selling followers or engagement
❌ Violating Instagram's terms of service

### Your Responsibilities
- Comply with Instagram's terms of service
- Respect user privacy and preferences
- Follow applicable laws and regulations
- Use the tool ethically and responsibly
- Stop if users request to be removed

## 📞 Support & Updates

For the latest updates and support:
- Check this README for troubleshooting
- Monitor Instagram for interface changes
- Keep Chrome browser updated
- Backup your leads and settings regularly

---

**⚠️ Disclaimer**: This extension is for legitimate business use only. Users are responsible for complying with Instagram's terms of service and applicable laws. The authors are not responsible for any account restrictions or violations that may result from misuse.

**Version**: 1.0.1  
**Last Updated**: December 2024  
**Compatibility**: Chrome 88+, Instagram Web  
**Status**: Active Development