#!/usr/bin/env python3
"""Course package checker for the AI Ads Automation Masterclass.
Usage: python3 check_package.py <package_dir>
Exit code 1 when a blocking problem is found. Review items are reported but do not fail the run."""
import csv,re,sys,os,glob,subprocess,collections
root=sys.argv[1] if len(sys.argv)>1 else '.'
fails=[];warns=[];info=[]
def F(m): fails.append(m)
def W(m): warns.append(m)
rows=list(csv.DictReader(open(os.path.join(root,'lessons.csv'),encoding='utf-8-sig')))
# 1 numbering
mods=collections.OrderedDict()
for r in rows: mods.setdefault(int(r['Module']),[]).append(r)
if list(mods)!=list(range(1,len(mods)+1)): F('Module numbers are not contiguous: %s'%list(mods))
for m,ls in mods.items():
    ids=[r['Lesson'] for r in ls]
    exp=['%d.%d'%(m,i+1) for i in range(len(ls))]
    if ids!=exp: F('Lesson numbering wrong in module %d: %s expected %s'%(m,ids,exp))
    if len({r['Module title'] for r in ls})!=1: F('Inconsistent module title inside module %d'%m)
if len(rows)!=len({r['Lesson'] for r in rows}): F('Duplicate lesson ids')
info.append('%d modules, %d lessons, %d minutes'%(len(mods),len(rows),sum(int(r['Minutes']) for r in rows)))
# 2 module names across docs
titles={m:ls[0]['Module title'] for m,ls in mods.items()}
cur=open(os.path.join(root,'curriculum.md'),encoding='utf8').read()
for m,t in titles.items():
    if 'Module %d: %s'%(m,t) not in cur: F('curriculum.md missing "Module %d: %s"'%(m,t))
for m,ls in mods.items():
    for r in ls:
        if 'Lesson %s: %s'%(r['Lesson'],r['Lesson title']) not in cur: F('curriculum.md missing lesson %s'%r['Lesson'])
# 3 resource references
res_dir=os.path.join(root,'resources')
files=sorted(os.listdir(res_dir)) if os.path.isdir(res_dir) else []
if len(files)!=9: F('Expected 9 resource files, found %d'%len(files))
txt={}
for f in files:
    p=os.path.join(res_dir,f)
    if f.endswith('.pdf'):
        txt[f]=subprocess.run(['pdftotext','-layout',p,'-'],capture_output=True,text=True).stdout
    elif f.endswith('.xlsx'):
        import openpyxl
        txt[f]=' '.join(openpyxl.load_workbook(p).sheetnames)
    if os.path.getsize(os.path.join(res_dir,f))==0: F('Empty resource file '+f)
alltxt='\n'.join(txt.values()).lower()
docs={'Prompt Library':'01-','Ad Copy Templates':'02-','Creative Brief Template':'03-','Campaign Planning Worksheet':'04-','Audience Research Worksheet':'05-','Performance Tracker':'06-','Campaign Launch Checklist':'07-','Campaign Optimisation Checklist':'08-','Campaign Project Brief and Rubric':'09-'}
tobeproduced=collections.Counter()
for r in rows:
    for ref in [x.strip() for x in r['Resources'].split(';')]:
        base=re.sub(r'\s*\(.*\)$','',ref).strip()
        inm=re.search(r'\(in ([^)]*)\)$',ref)
        if inm:
            sect=base; ref='%s (%s)'%(inm.group(1),sect); base=inm.group(1)
        hit=[k for k in docs if base.startswith(k) or base==k]
        if base=='Campaign file template': hit=['Campaign Planning Worksheet']
        if hit:
            f=[x for x in files if x.startswith(docs[hit[0]])]
            if not f: F('Lesson %s references %s but file is missing'%(r['Lesson'],ref)); continue
            sec=re.search(r'\((.*)\)$',ref)
            if sec:
                s=re.sub(r'^(section|in)\s+','',sec.group(1),flags=re.I)
                s=re.sub(r'\s*(section|sheet)$','',s,flags=re.I).strip().lower()
                if s and not re.fullmatch(r'[a-g]',s) and s not in txt[f[0]].lower(): W('Lesson %s: section "%s" not found inside %s'%(r['Lesson'],sec.group(1),f[0]))
                if re.fullmatch(r'[a-g]',s) and not re.search(r'^\s*%s\.'%s.upper(),txt[f[0]],re.M): W('Lesson %s: prompt library section %s not found'%(r['Lesson'],s.upper()))
        else:
            tobeproduced[ref]+=1
for k,v in tobeproduced.items(): W('Resource "%s" (used in %d lesson) is not a file in the package. It must be produced.'%(k,v))
# 4 banned style
bad=[('em dash',chr(0x2014)),('emoji',re.compile(r'[\U0001F300-\U0001FAFF\u2600-\u27BF]'))]
banned=re.compile(r'\b(delve|unlock|embark|innovative|revolutionary|groundbreaking|harness|utilize|utilizing|craft|crafting|skyrocket\w*|paradigm|unveil|illuminate|remarkable|imagine|discover)\b',re.I)
scan={**{os.path.basename(f):open(f,encoding='utf8').read() for f in glob.glob(root+'/*.md')+glob.glob(root+'/*.csv')},**txt}
for n,t in scan.items():
    if chr(0x2014) in t: F('Em dash in '+n)
    if bad[1][1].search(t): F('Emoji in '+n)
    for m in banned.finditer(t): W('Banned word "%s" in %s'%(m.group(0),n))
# 5 claims
claims=re.compile(r'(guarantee[ds]?|make money|get rich|passive income|double your|10x|\d+\s?x\s+roas|earn\s+₦|risk[- ]free|overnight)',re.I)
for n,t in scan.items():
    for ln in t.split('\n'):
        if re.match(r'\s*[A-D]\.\s',ln): continue
        for m in claims.finditer(ln):
            ok=re.search(r'(only if|no guarantee|does not promise|not guarantee|do not promise|never|invented|\'[^\']*%s[^\']*\')'%re.escape(m.group(0)),ln,re.I)
            (info if ok else warns).append('Claim review in %s: "%s" in: %s'%(n,m.group(0),ln.strip()[:110]))
# 6 third party IP
ip=re.compile(r'(naked offer|fotizo|shadow compass|naked promise)',re.I)
for n,t in scan.items():
    if ip.search(t): W('Third party framework named in %s (needs permission or replacement)'%n)
if not any(ip.search(t) for t in scan.values()): info.append('No mention of the Naked Offer Framework in lessons, quizzes or resources. Permission is still required before any future use.')
# 7 Meta UI terms
ui=re.compile(r'(Ads Manager|Business Suite|Events Manager|Advantage\+|Business portfolio|Business Settings|Accounts Center|Meta Pixel|Conversions API|Ad Library|Test events|Create ad|Learning phase)',re.I)
c=collections.Counter()
for r in rows:
    blob=' '.join([r['Lesson title'],r['Objective'],r['Demonstration'],r['Assignment']])
    if ui.search(blob) and r['Needs screen recording']=='Yes': c[r['Lesson']]+=1
info.append('Lessons that name Meta screens and need re-checking against the live interface at recording time: '+', '.join(sorted(c,key=lambda x:[int(p) for p in x.split('.')])))
# 8 quizzes
a=open(os.path.join(root,'assessments.md'),encoding='utf8').read()
for q in range(1,6):
    if 'Quiz %d'%q not in a: F('assessments.md missing Quiz %d'%q)
long=[r['Lesson'] for r in rows if int(r['Minutes'])>15]
info.append('%d lessons run longer than 15 minutes: %s'%(len(long),', '.join(long)))
print('FAIL' if fails else 'PASS')
for x in fails: print('FAIL:',x)
for x in warns: print('WARN:',x)
for x in info: print('INFO:',x)
sys.exit(1 if fails else 0)
