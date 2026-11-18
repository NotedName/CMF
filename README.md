# Clearance Monitoring
(repository name: CMF)

How to use the Clearance System!

Steps:

1. Download the Code
2. Run XAMPP MySQL and Apache
3. Double-click 'start_server.bat' (dont exit the cmd)
4. Run Log-in HTML
5. Username: admin | Password: admin1

## Students, RFID numbers and student numbers

- The **student number** identifies a student and never changes. New student records use it as the document ID.
- The **RFID number** is the current ID card. It changes every year, so it is a normal field. Replaced card numbers are kept in `previousRfids`.
- Importing or registering a student number that already exists only updates the RFID number (Year Level / A.Y. only if the option is ticked in the import window). Nothing else is overwritten.
- Clearance logs are matched by student number, so a form released with last year's card can still be received with the new one.
- Students > Export (Excel/CSV) uses the same columns as the import template, so the exported file can be imported again.

After changing `firestore.rules`, deploy them: `firebase deploy --only firestore:rules,hosting`

## Design system

The interface follows the **Arco Design** language (arco.design). Arco's components are React/Vue, and this project is plain HTML + vanilla JS, so `public/style.css` implements Arco's tokens and component styling directly (10-step primary ramp, 4px spacing, 2/4/8px radii, 14px type scale, border-led surfaces; Layout, Menu, Button, Input, Select, Table, Modal, Tabs, Badge, BackTop) in the "Crystalline" palette (#0D2D73 #22538D #3F8AB1 #65D0E0 #77F1F6).

- Colors live in the `:root` / `body.dark-mode` tokens at the top of `style.css` (`--primary-1 … --primary-8`, `--color-*`). Change `--primary-6` to re-theme the whole system.
- Dark mode is still toggled with `body.dark-mode` (no JS changes needed).
- Class names and ids used by `script.js` were not changed.

## Returned form photo (verification)

- In **Clearance Logs**, a log with status **Returned** has a **Verification** column. **Add photo** opens a dialog with **Take photo** (opens the camera on phones and tablets) or **Choose from files**. Saving marks the log **Verified**; **View photo** shows it again and **Replace photo** swaps it.
- **Re-releases** are kept as a history on the log (`reReleases`: date and optional comment each). The Clearance Logs row grows with each re-release, and Status Update shows the same list for a released form.
- **Save and verify** asks for confirmation first. The **admin** role cannot replace a photo. The **superadmin** can **Remove photo**, which deletes the photo and sets the log back to unverified so it has to be verified again.
- The photo is only a check on the returned status. It is **not** part of the Excel, CSV or PDF exports.
- Photos are compressed in the browser (longest side 1400 px, JPEG) and stored in the `clearancePhotos` collection under the same ID as the log, so the log list stays fast. Deleting a log (superadmin) also deletes its photo.
- The **Verification** filter finds returned logs that still have no photo.
- Deploy the new rules together with the site: `firebase deploy --only firestore:rules,hosting`

## Name and logo

- The system is called **Clearance Monitoring** (it was "Clearance Monitoring Form"). The repository and Firebase project keep the short name CMF.
- Logo files are in `public/Resources/`: `logo.svg` / `logo-dark.svg` (icon + name, for light / dark backgrounds), `logo-icon.svg` / `logo-icon-dark.svg` (icon only, used in the top bar and as the favicon) and `logo-icon-white.svg` (for the blue login banner). The St. Mary's College logo is still on the login page.
- The login page uses a split layout (brand banner + form), following Arco Design's login template.
