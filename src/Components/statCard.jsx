function StatCard({ title, value, description, icon: Icon, iconBg }) {

    return (

        <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/[0.03] transition duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">

            <div className={`${iconBg} w-fit rounded-xl p-3 shadow-lg transition duration-200 group-hover:scale-105`}>
                <Icon className="text-white" size={22} />
            </div>


            <div className="mt-4">

                <p className="text-sm font-medium text-slate-500">
                    {title}
                </p>


                <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                    {value}
                </h2>


                <p className="text-gray-400 text-xs mt-1">
                    {description}
                </p>

            </div>

        </div>

    );

}


export default StatCard;
