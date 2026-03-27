╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║           CORPORATE DASHBOARD - DEMO CREDENTIALS            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

📧 EMAIL:    demo@corporate.com
🔑 PASSWORD: demo123

🏢 COMPANY:  Acme Corp Pvt Ltd


╔══════════════════════════════════════════════════════════════╗
║                      HOW TO START                            ║
╚══════════════════════════════════════════════════════════════╝

1. Run: docker-compose up --build

2. Wait 1-2 minutes for services to start
   Look for this message in logs:
   "✅ Demo setup completed successfully!"

3. Open: http://localhost:3000

4. Login with credentials above

5. You'll see the dashboard with pre-loaded data! 🎉


╔══════════════════════════════════════════════════════════════╗
║                    WHAT'S INCLUDED                           ║
╚══════════════════════════════════════════════════════════════╝

✓ 3 Bank Accounts (Checking, Savings, Credit Card)
✓ 6 Sample Transactions (Income & Expenses)
✓ Real-time Analytics Dashboard
✓ Global Search Functionality
✓ Multi-company Support
✓ Secure Authentication


╔══════════════════════════════════════════════════════════════╗
║                 CREATING YOUR OWN ACCOUNT                    ║
╚══════════════════════════════════════════════════════════════╝

If you want to start fresh:

1. Click "Sign up" on login page
2. Enter your details (name, email, password)
3. After registration, you'll see "Create Your Company" modal
4. Fill in company details and click "Create Company"
5. Start adding your own accounts and transactions!


╔══════════════════════════════════════════════════════════════╗
║                   TROUBLESHOOTING                            ║
╚══════════════════════════════════════════════════════════════╝

Problem: "Please select or create a company to continue"
Solution: The demo user was created but company wasn't linked.
          Just wait 30 more seconds and refresh the page.

Problem: Login doesn't work
Solution: 1. Wait 30 seconds after "docker-compose up"
          2. Check logs: docker-compose logs backend
          3. Look for: "✅ Demo setup completed successfully!"

Problem: Still not working
Solution: Fresh start:
          docker-compose down -v
          docker-compose up --build


╔══════════════════════════════════════════════════════════════╗
║                    MORE INFORMATION                          ║
╚══════════════════════════════════════════════════════════════╝

📖 Quick Start Guide: QUICK_START.md
📖 Full Documentation: CORPORATE_DASHBOARD_IMPLEMENTATION.md
📖 Demo Details: DEMO_CREDENTIALS.md


Need help? Check the logs or restart the services!
