function StatCard({ title, value, description, icon: Icon, iconBg }) {

    return (

        <div className="group rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-950/[0.03] transition duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-4 lg:p-5">

            <div className={`${iconBg} w-fit rounded-xl p-2.5 shadow-lg transition duration-200 group-hover:scale-105 sm:p-3`}>
                <Icon className="text-white" size={18} />
            </div>


            <div className="mt-3">

                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:text-sm">
                    {title}
                </p>


                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                    {value}
                </h2>


                <p className="mt-1 text-[11px] leading-5 text-slate-400 sm:text-xs">
                    {description}
                </p>

            </div>

        </div>

    );

}


export default StatCard;
