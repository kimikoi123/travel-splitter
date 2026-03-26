import { useState } from 'react';
import { Plus, X, UserPlus } from 'lucide-react';
import { getInitials, getAvatarColor } from '../utils/helpers';
import type { Member } from '../types';

interface MemberManagerProps {
  members: Member[];
  onAdd: (name: string) => Member | undefined;
  onRemove: (id: string) => boolean | undefined;
}

export default function MemberManager({ members, onAdd, onRemove }: MemberManagerProps) {
  const [name, setName] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim());
    setName('');
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
          Members ({members.length})
        </h3>
        <button
          onClick={() => setShowInput(!showInput)}
          className="p-1.5 rounded-lg hover:bg-surface-light transition-colors text-primary"
        >
          <UserPlus size={16} />
        </button>
      </div>

      {showInput && (
        <form onSubmit={handleAdd} className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoFocus
          />
          <button
            type="submit"
            className="px-3 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors text-sm"
          >
            <Plus size={16} />
          </button>
        </form>
      )}

      {members.length === 0 ? (
        <p className="text-text-secondary text-xs py-2">Add members to start splitting expenses</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {members.map((m, i) => (
            <div
              key={m.id}
              className="flex items-center gap-2 bg-surface-light rounded-full pl-1 pr-2 py-1 group"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ backgroundColor: getAvatarColor(i) }}
              >
                {getInitials(m.name)}
              </div>
              <span className="text-sm text-text-primary">{m.name}</span>
              <button
                onClick={() => {
                  const removed = onRemove(m.id);
                  if (removed === false) alert(`Can't remove ${m.name} — they have expenses.`);
                }}
                className="p-0.5 rounded-full text-text-secondary hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
