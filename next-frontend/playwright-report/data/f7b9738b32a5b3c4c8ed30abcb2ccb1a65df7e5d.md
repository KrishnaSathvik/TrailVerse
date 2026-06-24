# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - link "TrailVerse Logo TrailVerse" [ref=e4]:
        - /url: /
        - img "TrailVerse Logo" [ref=e5]
        - generic [ref=e6]: TrailVerse
      - generic [ref=e7]:
        - heading "Forgot your password?" [level=1] [ref=e8]
        - paragraph [ref=e9]: No worries! Enter your email and we'll send you instructions to reset your password.
    - generic [ref=e11]:
      - generic [ref=e12]:
        - heading "Reset your password" [level=2] [ref=e13]
        - paragraph [ref=e14]: Enter your email address and we'll send you a link to reset your password.
      - generic [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Email Address
          - generic [ref=e18]:
            - img [ref=e19]
            - textbox "Enter your email" [ref=e21]
        - button "Send Reset Link" [ref=e22] [cursor=pointer]:
          - generic: Send Reset Link
        - link "Back to Login" [ref=e24]:
          - /url: /login
          - img [ref=e25]
          - text: Back to Login
      - paragraph [ref=e27]:
        - text: Remember your password?
        - link "Sign in" [ref=e28]:
          - /url: /login
  - button "Talk to Trailie — voice assistant" [ref=e30] [cursor=pointer]:
    - img
  - button "Open Next.js Dev Tools" [ref=e36] [cursor=pointer]:
    - img [ref=e37]
  - alert [ref=e42]
```