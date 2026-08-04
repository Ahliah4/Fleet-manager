import { Search } from "lucide-react";

function SearchInput({ value, onChange, placeholder = "Search..." }) {
    return (
        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
                aria-label={placeholder}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="app-input min-h-[44px] py-3 pl-11"
                type="text"
            />
        </div>
    );
}

export default SearchInput;
