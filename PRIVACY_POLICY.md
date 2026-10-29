Equicord is designed with user privacy in mind and doesn’t collect or share any personal data. Since it’s an extension for Discord, it operates entirely within the Discord platform. This means all interactions and data management follow Discord’s privacy policies, which you can check out at [discord.com/privacy](https://discord.com/privacy/). So, while Equicord doesn’t handle your data, it’s a good idea to review Discord’s policy to understand how your information is managed. This setup ensures transparency and follows standard practices for third-party tools working within larger platforms.

## Vault badges

The **VaultBadges** plugin (enabled by default) shows Vault's profile badges (Owner, Staff, Donor, Bug Hunter, Helper, Member) to Vault users.

- To show your **Member** badge, Vault sends **only your Discord user id** to Vault's badge service (hosted on Supabase, EU region) and stores it with the dates it was first and last seen. Nothing else is sent: no messages, no token, no profile data.
- To display badges, Vault asks the service about the users whose profiles you open, by user id.
- The member list cannot be downloaded: the service only answers for user ids it is asked about.
- To stop sharing your id, turn off **Show the Member badge** in the VaultBadges settings (your id is then deleted from the service), or disable the plugin.
