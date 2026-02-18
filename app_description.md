App for field hockey umpires to indicate availabiltiy and planner to assign umpires to matches. Field hockey requires two umpires per match.

High-level process:

1. Planner provides matches (excel, csv, copy/paste) - may need mechanism to filter to only matches that are assigned
2. Umpires get URL (via whatsapp or mail) to go to site where they can indicate availability (yes, no, maybe)
3. Based on availability, planner assigns umpires to matches

Build using red/green TDD.

Availability poll is for 2 hour slots, not exact games. For example: game starts at 11:15am -> Slot 10:45-12:45.
Slots start at least 20 minutes before match at (xx:00, xx:15, xx:30 or xx:45, and last 2 hours. E.g. match starting at 12:05 -> slot 11:45 to 13:45

Frontend modern NodeJS, mobile responsive, deployed on Vercel
Backend: Supabase for db, auth etc. Vercel

Deployed via Vercel with Supabase for db, auth etc

TailwindCSS 4.0 (!)

Two main interfaces:

1. planner (admin)
   1. Upload excel/csv/copy paste matches for coming weeks. Then CRUD matches
   2. CRUD umpires
   3. Assigns umpires to matches (first manual, later feature: automated)
   4. generate links to availability polls
2. umpire (user)
   1. mobile website for availability polls
   2. polls: modern looking interface to set availability for games (yes, if need be, no) - similar to rallly
   3. ability to go back to poll to change later

Examples (don't have to replite exactly)
![2a043d272932864eb7998771f0ee00ed.png](./_resources/2a043d272932864eb7998771f0ee00ed.png)

![9a2448a2f315f17afb23fb39b74bc1d3.png](./_resources/9a2448a2f315f17afb23fb39b74bc1d3.png)
