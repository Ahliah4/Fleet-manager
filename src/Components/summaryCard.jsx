export default function SummaryCard({
  title,
  value,
  color,
  icon,
}) {
  return (
    <div
      className={`rounded-3xl bg-white shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 p-6`}
    >
      <div className="text-5xl mb-4">{icon}</div>

      <p className="text-gray-500">
        {title}
      </p>

      <h2 className={`text-4xl font-bold ${color}`}>
        {value}
      </h2>
    </div>
  );
}