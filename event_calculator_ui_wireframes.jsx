import React from "react";

// Event Calculator PWA - Sample UI Wireframes
// Single-file React components (TailwindCSS). Default export: App component.
// Use this as a starting point for designers/devs. Replace mock data with real APIs.

function TopBar({ title }) {
  return (
    <header className="w-full bg-white shadow-sm p-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="px-3 py-1 rounded-md border">Install</button>
        <button className="px-3 py-1 rounded-md bg-blue-600 text-white">Sync</button>
      </div>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className="w-64 bg-gray-50 p-4 hidden md:block">
      <nav className="flex flex-col gap-2">
        <button className="text-left py-2 px-3 rounded hover:bg-gray-100">Dashboard</button>
        <button className="text-left py-2 px-3 rounded hover:bg-gray-100">Sales Entry</button>
        <button className="text-left py-2 px-3 rounded hover:bg-gray-100">Events</button>
        <button className="text-left py-2 px-3 rounded hover:bg-gray-100">Employees</button>
        <button className="text-left py-2 px-3 rounded hover:bg-gray-100">Recipes</button>
        <button className="text-left py-2 px-3 rounded hover:bg-gray-100">Reports</button>
      </nav>
    </aside>
  );
}

function KPI({ label, value, delta }) {
  return (
    <div className="bg-white p-4 rounded shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold">{value}</div>
        {delta && <div className="text-sm text-green-600">{delta}</div>}
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <section className="p-4 grid gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI label="Gross Sales" value="$0.00" delta="+0%" />
        <KPI label="Total Expenses" value="$0.00" delta="-" />
        <KPI label="Net Profit" value="$0.00" delta="0%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="col-span-2 bg-white p-4 rounded shadow-sm">
          <h3 className="font-semibold mb-2">Sales by Drink (today)</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th>Drink</th>
                <th>Qty</th>
                <th>Cost</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td>Lemonade</td>
                <td>0</td>
                <td>$0.96</td>
                <td>$0.00</td>
              </tr>
              <tr className="border-t">
                <td>Blue Raspberry</td>
                <td>0</td>
                <td>$1.14</td>
                <td>$0.00</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-white p-4 rounded shadow-sm">
          <h3 className="font-semibold mb-2">Quick Actions</h3>
          <div className="flex flex-col gap-2">
            <button className="py-2 rounded bg-green-600 text-white">New Sale</button>
            <button className="py-2 rounded bg-blue-600 text-white">Create Event</button>
            <button className="py-2 rounded border">Export CSV</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SalesEntryForm() {
  return (
    <section className="p-4">
      <h2 className="font-semibold mb-4">Sales Entry</h2>
      <form className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-sm">Drink</label>
          <select className="w-full border rounded p-2">
            <option>Lemonade</option>
            <option>Blue Raspberry Lemonade</option>
            <option>Peach Lemonade</option>
          </select>
        </div>

        <div>
          <label className="block text-sm">Quantity</label>
          <input type="number" className="w-full border rounded p-2" defaultValue={1} />
        </div>

        <div>
          <label className="block text-sm">Price</label>
          <input type="text" className="w-full border rounded p-2" defaultValue="$0.96" />
        </div>

        <div className="sm:col-span-3 flex gap-2 mt-2">
          <button type="button" className="px-4 py-2 bg-blue-600 text-white rounded">Add Sale</button>
          <button type="button" className="px-4 py-2 border rounded">Reset</button>
        </div>
      </form>

      <div className="mt-6 bg-white p-4 rounded shadow-sm">
        <h3 className="font-semibold">Recent Entries</h3>
        <ul className="mt-2 text-sm text-gray-700">
          <li>No entries yet.</li>
        </ul>
      </div>
    </section>
  );
}

function EmployeesPanel() {
  return (
    <section className="p-4">
      <h2 className="font-semibold mb-4">Employees</h2>
      <div className="bg-white p-4 rounded shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th>Name</th>
              <th>Hours</th>
              <th>Rate</th>
              <th>Pay</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td>John Doe</td>
              <td>0</td>
              <td>$12.00</td>
              <td>$0.00</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <TopBar title="Event Calculator 2.0" />
      <div className="flex">
        <Sidebar />
        <main className="flex-1">
          <Dashboard />
          <div className="max-w-4xl mx-auto">
            <SalesEntryForm />
            <EmployeesPanel />
          </div>
        </main>
      </div>
    </div>
  );
}
