import re

filepath = 'src/app/admin/page.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports
if 'useLanguage' not in content:
    content = content.replace("import { useEffect, useState } from 'react';", "import { useEffect, useState } from 'react';\nimport { useLanguage } from '../../contexts/LanguageContext';\nimport { LanguageSwitcher } from '../../components/LanguageSwitcher';")

if 'const { t } = useLanguage();' not in content:
    content = content.replace('export default function AdminDashboard() {\n', 'export default function AdminDashboard() {\n  const { t } = useLanguage();\n')


replacements = {
    # getAdminLoginMessage
    "function getAdminLoginMessage(error: unknown) {": "function getAdminLoginMessage(error: unknown, t: any) {",
    "'กรุณาตรวจสอบอีเมล รหัสผ่าน และสถานะผู้ใช้ใน Supabase Auth'": "t('กรุณาตรวจสอบอีเมล รหัสผ่าน และสถานะผู้ใช้ใน Supabase Auth', 'Please check email, password, and user status in Supabase Auth')",
    "'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือผู้ใช้นี้ยังไม่ได้ถูกสร้างใน Supabase Auth'": "t('อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือผู้ใช้นี้ยังไม่ได้ถูกสร้างใน Supabase Auth', 'Invalid email or password, or user not created in Supabase Auth')",
    "'ใน Supabase ยังไม่ได้เปิด Email provider กรุณาไปที่ Authentication > Sign In / Providers แล้วเปิด Email'": "t('ใน Supabase ยังไม่ได้เปิด Email provider กรุณาไปที่ Authentication > Sign In / Providers แล้วเปิด Email', 'Email provider is not enabled in Supabase. Go to Authentication > Sign In / Providers and enable Email.')",
    "'บัญชีนี้ยังไม่ยืนยันอีเมล กรุณายืนยันอีเมลใน Supabase หรือปิด email confirmation ชั่วคราว'": "t('บัญชีนี้ยังไม่ยืนยันอีเมล กรุณายืนยันอีเมลใน Supabase หรือปิด email confirmation ชั่วคราว', 'Email not confirmed. Please confirm email in Supabase or temporarily disable email confirmation.')",
    "'มีการลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'": "t('มีการลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่', 'Too many login attempts. Please try again later.')",
    "if (message.includes('ไม่มีสิทธิ์ผู้ดูแลระบบ')) {": "if (message.includes('ไม่มีสิทธิ์ผู้ดูแลระบบ') || message.includes('No admin privileges')) {",
    "`${error.message} | ตรวจสอบว่าเปิด Email provider และสร้างผู้ใช้ผู้ดูแลด้วยอีเมล ${PRIMARY_ADMIN_EMAIL}`": "`${error.message} | ${t('ตรวจสอบว่าเปิด Email provider และสร้างผู้ใช้ผู้ดูแลด้วยอีเมล', 'Make sure Email provider is enabled and admin user is created with email')} ${PRIMARY_ADMIN_EMAIL}`",

    # Calls to getAdminLoginMessage
    "getAdminLoginMessage(e)": "getAdminLoginMessage(e, t)",
    "getAdminLoginMessage(error)": "getAdminLoginMessage(error, t)",

    # getStatusMeta
    "function getStatusMeta(status: TicketStatus) {": "function getStatusMeta(status: TicketStatus, t: any) {",
    "label: 'รอดำเนินการ'": "label: t('รอดำเนินการ', 'Pending')",
    "label: 'กำลังทำ'": "label: t('กำลังทำ', 'In Progress')",
    "label: 'เสร็จสิ้น'": "label: t('เสร็จสิ้น', 'Completed')",
    "label: 'ไม่ผ่าน'": "label: t('ไม่ผ่าน', 'Rejected')",
    "getStatusMeta(selectedTicket.status).badgeClass": "getStatusMeta(selectedTicket.status, t).badgeClass",
    "getStatusMeta(status).badgeClass": "getStatusMeta(status, t).badgeClass",
    "getStatusMeta(ticket.status).badgeClass": "getStatusMeta(ticket.status, t).badgeClass",
    "getStatusMeta(t.status).badgeClass": "getStatusMeta(t.status, t).badgeClass",

    # buildRankings
    "const key = value?.trim() || 'ไม่ระบุ';": "const key = value?.trim() || t('ไม่ระบุ', 'Unknown');",

    # handleLogin / swal
    "`บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ ใช้อีเมล ${PRIMARY_ADMIN_EMAIL} เท่านั้น`": "t(`บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ ใช้อีเมล ${PRIMARY_ADMIN_EMAIL} เท่านั้น`, `No admin privileges. Use ${PRIMARY_ADMIN_EMAIL} only.`)",
    "title: 'เข้าสู่ระบบไม่สำเร็จ'": "title: t('เข้าสู่ระบบไม่สำเร็จ', 'Login Failed')",
    
    # handleForgotPassword
    "title: 'ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว'": "title: t('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว', 'Password Reset Link Sent')",
    "`กรุณาตรวจสอบอีเมล ${PRIMARY_ADMIN_EMAIL} แล้วเปิดลิงก์เพื่อกำหนดรหัสผ่านใหม่`": "t(`กรุณาตรวจสอบอีเมล ${PRIMARY_ADMIN_EMAIL} แล้วเปิดลิงก์เพื่อกำหนดรหัสผ่านใหม่`, `Please check your email ${PRIMARY_ADMIN_EMAIL} and open the link to set a new password`)",
    "'ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้'": "t('ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้', 'Unable to send password reset link')",
    "title: 'ส่งลิงก์ไม่สำเร็จ'": "title: t('ส่งลิงก์ไม่สำเร็จ', 'Failed to Send Link')",

    # handleUpdate
    "title: 'กำลังบันทึก...'": "title: t('กำลังบันทึก...', 'Saving...')",
    "title: 'อัปเดตงานสำเร็จ'": "title: t('อัปเดตงานสำเร็จ', 'Update Successful')",
    "'บันทึกข้อมูลเรียบร้อยแล้ว'": "t('บันทึกข้อมูลเรียบร้อยแล้ว', 'Data saved successfully')",
    "'ไม่สามารถบันทึกข้อมูลได้'": "t('ไม่สามารถบันทึกข้อมูลได้', 'Unable to save data')",
    "title: 'เกิดข้อผิดพลาด'": "title: t('เกิดข้อผิดพลาด', 'Error Occurred')",

    # JSX Texts (simple replacements)
    "กำลังตรวจสอบสิทธิ์...": "{t('กำลังตรวจสอบสิทธิ์...', 'Checking permissions...')}",
    "Supabase ยังไม่ถูกตั้งค่า": "{t('Supabase ยังไม่ถูกตั้งค่า', 'Supabase is not configured')}",
    "เพิ่ม `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ใน `.env.local`\n            จากนั้นสร้างตารางและ bucket ตามไฟล์ `supabase/setup.sql`": "{t('เพิ่ม `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ใน `.env.local` จากนั้นสร้างตารางและ bucket ตามไฟล์ `supabase/setup.sql`', 'Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.local`, then create the table and bucket according to `supabase/setup.sql`')}",
    "กรุณาเข้าสู่ระบบ": "{t('กรุณาเข้าสู่ระบบ', 'Please Login')}",
    "เข้าสู่ระบบด้วยบัญชีผู้ดูแลที่สร้างไว้ใน Supabase Auth": "{t('เข้าสู่ระบบด้วยบัญชีผู้ดูแลที่สร้างไว้ใน Supabase Auth', 'Login with an admin account created in Supabase Auth')}",
    "ถ้า login ไม่ผ่าน ให้ตรวจสอบว่าเปิด Email provider แล้ว, สร้างผู้ใช้ผู้ดูแลแล้ว,\n            และหากเปิด Confirm email อยู่ต้องยืนยันอีเมลก่อน": "{t('ถ้า login ไม่ผ่าน ให้ตรวจสอบว่าเปิด Email provider แล้ว, สร้างผู้ใช้ผู้ดูแลแล้ว, และหากเปิด Confirm email อยู่ต้องยืนยันอีเมลก่อน', 'If login fails, check if Email provider is enabled, admin user is created, and if Confirm email is required, confirm it first.')}",
    "placeholder=\"อีเมลผู้ดูแล\"": "placeholder={t('อีเมลผู้ดูแล', 'Admin Email')}",
    "placeholder=\"รหัสผ่าน\"": "placeholder={t('รหัสผ่าน', 'Password')}",
    ">เข้าสู่ระบบ<": ">{t('เข้าสู่ระบบ', 'Login')}<",
    "'กำลังส่งลิงก์...' : 'ลืมรหัสผ่าน?'": "t('กำลังส่งลิงก์...', 'Sending link...') : t('ลืมรหัสผ่าน?', 'Forgot Password?')",
    "หากเปิดอีเมลจากลิงก์ reset แล้วเด้งกลับหน้าแรก ระบบจะพาไปหน้าเปลี่ยนรหัสผ่านให้อัตโนมัติ": "{t('หากเปิดอีเมลจากลิงก์ reset แล้วเด้งกลับหน้าแรก ระบบจะพาไปหน้าเปลี่ยนรหัสผ่านให้อัตโนมัติ', 'If you open the email from the reset link and it redirects to the home page, the system will automatically take you to the password reset page.')}",
    "หรือเปิดตรงที่ <Link href=\"/reset-password\" className=\"font-semibold text-teal-700 hover:text-teal-800\">หน้าเปลี่ยนรหัสผ่าน</Link>": "{t('หรือเปิดตรงที่', 'Or open')} <Link href=\"/reset-password\" className=\"font-semibold text-teal-700 hover:text-teal-800\">{t('หน้าเปลี่ยนรหัสผ่าน', 'Password Reset Page')}</Link>",
    
    # Dashboard stats
    "ระบบภาพรวมนวัตกรรม": "{t('ระบบภาพรวมนวัตกรรม', 'Innovation Overview System')}",
    ">ออกจากระบบ<": ">{t('ออกจากระบบ', 'Sign Out')}<",
    "ข้อเสนอทั้งหมด": "{t('ข้อเสนอทั้งหมด', 'Total Suggestions')}",
    "งานใหม่เดือนนี้": "{t('งานใหม่เดือนนี้', 'New Tasks This Month')}",
    "รายการ</p>": "{t('รายการ', 'Items')}</p>",
    "อัตราปิดงาน": "{t('อัตราปิดงาน', 'Completion Rate')}",
    "เสร็จสิ้นแล้ว": "{t('เสร็จสิ้นแล้ว', 'Completed')}",
    "จาก": "{t('จาก', 'out of')}",
    "งาน</p>": "{t('งาน', 'tasks')}</p>",
    "งานที่มีรูปแนบ": "{t('งานที่มีรูปแนบ', 'Tasks with Images')}",
    "มีรูปก่อนหรือหลังรวม": "{t('มีรูปก่อนหรือหลังรวม', 'Contains before or after images:')}",
    "แผนกที่ส่งมากสุด": "{t('แผนกที่ส่งมากสุด', 'Top Sending Dept')}",
    "อัตรางานปิดแล้ว": "{t('อัตรางานปิดแล้ว', 'Resolved Rate:')}",
    
    "ภาพรวมสถานะงาน": "{t('ภาพรวมสถานะงาน', 'Task Status Overview')}",
    "อัปเดตจากข้อมูลล่าสุด": "{t('อัปเดตจากข้อมูลล่าสุด', 'Updated from latest data')}",
    "แนวโน้ม 6 เดือนล่าสุด": "{t('แนวโน้ม 6 เดือนล่าสุด', '6-Month Trend')}",
    ">จำนวนข้อเสนอ<": ">{t('จำนวนข้อเสนอ', 'Suggestions')}<",
    "รายงานตามแผนก": "{t('รายงานตามแผนก', 'Report by Department')}",
    "ยังไม่มีข้อมูลสำหรับจัดอันดับแผนก": "{t('ยังไม่มีข้อมูลสำหรับจัดอันดับแผนก', 'No data available for department ranking')}",
    "รายงานตามประเภทข้อเสนอ": "{t('รายงานตามประเภทข้อเสนอ', 'Report by Suggestion Type')}",
    "ยังไม่มีข้อมูลสำหรับจัดอันดับประเภทข้อเสนอ": "{t('ยังไม่มีข้อมูลสำหรับจัดอันดับประเภทข้อเสนอ', 'No data available for suggestion type ranking')}",
    
    "รายงานล่าสุด": "{t('รายงานล่าสุด', 'Latest Reports')}",
    "รายการใหม่ล่าสุดและสถานะปัจจุบันสำหรับติดตามอย่างรวดเร็ว": "{t('รายการใหม่ล่าสุดและสถานะปัจจุบันสำหรับติดตามอย่างรวดเร็ว', 'Latest items and current status for quick tracking')}",
    "ล่าสุด": "{t('ล่าสุด', 'Latest')}",
    "ยังไม่มีรายการล่าสุดให้แสดง": "{t('ยังไม่มีรายการล่าสุดให้แสดง', 'No latest items to show')}",
    
    "รายการตรวจสอบ": "{t('รายการตรวจสอบ', 'Checklist')}",
    "แสดงผล": "{t('แสดงผล', 'Showing')}",
    "ทั้งหมด": "{t('ทั้งหมด', 'Total')}",
    "<option value=\"All\">ทั้งหมด</option>": "<option value=\"All\">{t('ทั้งหมด', 'All')}</option>",
    ">Pending (รอดำเนินการ)<": ">{t('Pending (รอดำเนินการ)', 'Pending')}<",
    ">Approved (กำลังทำ)<": ">{t('Approved (กำลังทำ)', 'Approved (In Progress)')}<",
    ">Completed (เสร็จสิ้น)<": ">{t('Completed (เสร็จสิ้น)', 'Completed')}<",
    ">Rejected (ไม่ผ่าน)<": ">{t('Rejected (ไม่ผ่าน)', 'Rejected')}<",
    
    "แผนก</th>": "{t('แผนก', 'Department')}</th>",
    "ผู้ส่ง</th>": "{t('ผู้ส่ง', 'Sender')}</th>",
    "วันที่ส่ง</th>": "{t('วันที่ส่ง', 'Date')}</th>",
    "สถานะ</th>": "{t('สถานะ', 'Status')}</th>",
    "จัดการ</th>": "{t('จัดการ', 'Manage')}</th>",
    
    "ดู/แก้ไข": "{t('ดู/แก้ไข', 'View/Edit')}",
    "ไม่พบรายการข้อมูล": "{t('ไม่พบรายการข้อมูล', 'No data found')}",
    
    # Detail ticket
    "จัดการรายละเอียดงาน (Edit)": "{t('จัดการรายละเอียดงาน (Edit)', 'Manage Task Details (Edit)')}",
    ">กลับ<": ">{t('กลับ', 'Back')}<",
    "📌 รายละเอียดนวัตกรรม (Before)": "📌 {t('รายละเอียดนวัตกรรม (Before)', 'Innovation Details (Before)')}",
    "สถานะปัจจุบัน": "{t('สถานะปัจจุบัน', 'Current Status')}",
    ">ผู้ส่ง<": ">{t('ผู้ส่ง', 'Sender')}<",
    ">แผนก<": ">{t('แผนก', 'Department')}<",
    "ปัญหาที่พบ": "{t('ปัญหาที่พบ', 'Problem Found')}",
    "การแก้ไข<": "{t('การแก้ไข', 'Solution')}<",
    ">รายละเอียด<": ">{t('รายละเอียด', 'Details')}<",
    ">สาเหตุ<": ">{t('สาเหตุ', 'Cause')}<",
    "รูปภาพ Before": "{t('รูปภาพ Before', 'Before Images')}",
    "ไม่มีรูปภาพ": "{t('ไม่มีรูปภาพ', 'No Image')}",
    "รูปภาพ After (ที่มีแล้ว)": "{t('รูปภาพ After (ที่มีแล้ว)', 'After Images (If any)')}",
    "✍️ อัปเดตการดำเนินการ": "✍️ {t('อัปเดตการดำเนินการ', 'Update Status')}",
    ">สถานะ<": ">{t('สถานะ', 'Status')}<",
    ">ข้อเสนอแนะจากผู้บริหาร<": ">{t('ข้อเสนอแนะจากผู้บริหาร', 'Manager Feedback')}<",
    "placeholder=\"พิมพ์ข้อเสนอแนะ..\"": "placeholder={t('พิมพ์ข้อเสนอแนะ..', 'Type feedback..')}",
    ">ข้อมูลหลังการแก้ไข<": ">{t('ข้อมูลหลังการแก้ไข', 'Data After Edit')}<",
    "placeholder=\"ผลลัพธ์ที่ได้..\"": "placeholder={t('ผลลัพธ์ที่ได้..', 'Result..')}",
    "เพิ่มรูปหลังแก้ไข (After Image)": "{t('เพิ่มรูปหลังแก้ไข (After Image)', 'Add After Image')}",
    ">ยกเลิก<": ">{t('ยกเลิก', 'Cancel')}<",
    ">บันทึก<": ">{t('บันทึก', 'Save')}<",
    "<option value=\"Approved\">Approved (อนุมัติ/กำลังทำ)</option>": "<option value=\"Approved\">{t('Approved (อนุมัติ/กำลังทำ)', 'Approved (In Progress)')}</option>",
}

for k, v in replacements.items():
    content = content.replace(k, v)

# Add LanguageSwitcher to header
header_th = "<h1 className=\"text-2xl font-bold\">Hyeok-sin Admin</h1>"
if '<LanguageSwitcher />' not in content:
    content = content.replace(header_th, "<div className=\"flex justify-between items-center w-full\"><h1 className=\"text-2xl font-bold\">Hyeok-sin Admin</h1><LanguageSwitcher /></div>")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
