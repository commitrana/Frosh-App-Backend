// One-time reconciliation script.
// Your event.ticketsIssued counters have drifted from reality because of
// the race condition in the old /register route (see tickets.js fix).
// This recalculates every event's ticketsIssued from the actual Ticket
// documents in the DB, so the numbers you see in the admin panel match
// what's really in View Registrations.
//
// Usage:
//   node fixTicketCounts.js
//
// Make sure MONGODB_URI (or whatever your connection string env var is
// called) is set, same as your server uses.

const mongoose = require('mongoose');
const Event = require('./models/Event');
const Ticket = require('./models/Ticket');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const events = await Event.find({});
  let changed = 0;

  for (const event of events) {
    const realCount = await Ticket.countDocuments({ event: event._id });

    if (event.ticketsIssued !== realCount) {
      console.log(
        `"${event.name}": stored ticketsIssued=${event.ticketsIssued} -> actual=${realCount}`
      );
      event.ticketsIssued = realCount;
      await event.save();
      changed++;
    }
  }

  console.log(`\nDone. Corrected ${changed} of ${events.length} event(s).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});