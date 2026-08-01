function Settings() {
  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-bold text-white">
          Settings
        </h1>

        <p className="text-slate-400 mt-2">
          Manage your fleet system preferences and account settings.
        </p>
      </div>


      <div className="grid md:grid-cols-2 gap-6">

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">

          <h2 className="text-xl font-semibold text-white mb-4">
            Profile Settings
          </h2>

          <input
            type="text"
            placeholder="Admin User"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white mb-4"
          />


          <input
            type="email"
            placeholder="admin@fleet.com"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white"
          />

        </div>



        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">

          <h2 className="text-xl font-semibold text-white mb-4">
            System Settings
          </h2>


          <div className="space-y-4 text-slate-300">

            <label className="flex justify-between">
              Dark Mode
              <input type="checkbox" checked readOnly />
            </label>


            <label className="flex justify-between">
              Email Notifications
              <input type="checkbox" />
            </label>


            <label className="flex justify-between">
              Maintenance Alerts
              <input type="checkbox" checked readOnly />
            </label>

          </div>

        </div>

      </div>


      <button className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg">
        Save Changes
      </button>


    </div>
  );
}

export default Settings;