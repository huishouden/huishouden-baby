import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { CalendarMatch } from '@huishouden/pwa-kit/calendar';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { AddToCalendar, CalendarFind, LinkedEvent } from '@huishouden/pwa-kit/react/calendar';
import { appointmentEntry } from '../lib/agenda';
import { PrivateCheckbox } from '@huishouden/pwa-kit/react/contacts';
import { Checkbox, Dialog, Field, deleteButton, ghostButton, inputClass, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { addDays, fromLocalInput, toLocalInput } from '@huishouden/pwa-kit/time';
import type { Appointment } from '../lib/model';
import { LIMITS } from '../lib/model';
import { fromCalendar } from '../lib/calendarImport';
import type { AppointmentInput } from '../data/types';
import { auth } from '../data/firebase';
import { withShownRoles } from '../lib/contacts';
import { useT } from '../i18n';

export function AppointmentDialog({ appointment, now, contacts, calendarAvailable, canMarkPrivate = true, onSave, onDelete, onClose }: {
  appointment: Appointment | null;
  /** Admins and members may keep an appointment from helpers and kids. */
  canMarkPrivate?: boolean;
  now: number;
  contacts: Contact[];
  calendarAvailable: boolean;
  onSave: (input: AppointmentInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const initial = toLocalInput(appointment?.at ?? addDays(now, 1) + 9 * 3_600_000);
  const [title, setTitle] = useState(appointment?.title ?? '');
  const [date, setDate] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11));
  const [location, setLocation] = useState(appointment?.location ?? '');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [contactId, setContactId] = useState(appointment?.contactId ?? '');
  const [remind, setRemind] = useState(appointment?.remind !== false);
  const [isPrivate, setPrivate] = useState(appointment?.private === true);
  const [event, setEvent] = useState(appointment?.calendarEventId || appointment?.calendarLink ? { id: appointment.calendarEventId, link: appointment.calendarLink } : null);
  const at = fromLocalInput(`${date}T${time}`);
  const valid = title.trim().length > 0 && at !== null;
  // A contact that was deleted (or no longer shown in Baby) still appears until another is picked.
  const known = contactId && !contacts.some((c) => c.id === contactId);

  const save = () => {
    if (!valid || at === null) return;
    onSave({ title, at, location, notes, contactId: contactId || undefined, calendarEventId: event?.id, calendarLink: event?.link, private: canMarkPrivate && isPrivate, remind });
    onClose();
  };

  const pickMatch = (m: CalendarMatch) => {
    const filled = fromCalendar(m);
    const local = toLocalInput(filled.at);
    setDate(local.slice(0, 10));
    setTime(local.slice(11));
    if (filled.location) setLocation(filled.location);
    if (filled.notes) setNotes(filled.notes);
    setEvent({ id: filled.calendarEventId, link: filled.calendarLink });
  };

  const pickContact = (id: string) => {
    setContactId(id);
    const c = contacts.find((x) => x.id === id);
    if (c?.address && !location.trim()) setLocation(c.address.slice(0, LIMITS.location));
  };

  return (
    <Dialog
      title={appointment ? t('appointmentDialog.edit') : t('appointmentDialog.new')}
      onClose={onClose}
      footer={
        <>
          {appointment && appointmentEntry(appointment, null) && <AddToCalendar entry={appointmentEntry(appointment, null)!} />}
          {onDelete && (
            <button
              type="button"
              className={deleteButton}
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t('appointmentDialog.what')}>
          <input className={inputClass} value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder={t('appointmentDialog.whatPlaceholder')} />
        </Field>

        <CalendarFind auth={auth} app="Baby" name={t('app.name')} query={title} available={calendarAvailable} onPick={pickMatch} />

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.date')}>
            <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('common.time')}>
            <input className={inputClass} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {(contacts.length > 0 || contactId) && (
          <Field label={t('appointmentDialog.who')}>
            <select className={inputClass} value={contactId} onChange={(e) => pickContact(e.target.value)}>
              <option value="">{t('appointmentDialog.noOne')}</option>
              {withShownRoles(contacts).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.role ? t('appointmentDialog.contactWithRole', { name: c.name, role: c.role }) : c.name}
                </option>
              ))}
              {known && <option value={contactId}>{t('appointmentDialog.removedContact')}</option>}
            </select>
          </Field>
        )}
        <Field label={t('appointmentDialog.where')}>
          <input className={inputClass} value={location} maxLength={LIMITS.location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label={t('appointmentDialog.notes')}>
          <textarea className={`${inputClass} min-h-20`} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div>
          <Checkbox checked={remind} onChange={setRemind} describedBy="remind-hint">
            {t('appointmentDialog.remind')}
          </Checkbox>
          <p id="remind-hint" className="ml-9 text-sm text-muted">
            {t('appointmentDialog.remindHint')}
          </p>
        </div>
        {event && <LinkedEvent link={event.link} onUnlink={() => setEvent(null)} />}
        {canMarkPrivate && <PrivateCheckbox checked={isPrivate} onChange={setPrivate} />}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
