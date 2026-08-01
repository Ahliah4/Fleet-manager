function StatCard({ title, value, description, icon: Icon, iconBg }) {

    return (

        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl">

            <div className={`${iconBg} p-3 rounded-xl w-fit`}>
                <Icon className="text-white" size={22} />
            </div>


            <div className="mt-4">

                <p className="text-gray-500 text-sm">
                    {title}
                </p>


                <h2 className="text-3xl font-bold text-gray-900 mt-1">
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
