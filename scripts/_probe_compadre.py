import rdata, warnings, pickle
warnings.filterwarnings("ignore")
p = rdata.parser.parse_file("data/raw/compadre/COMPADRE_v.6.26.3.0.RData")
c = rdata.conversion.convert(p, default_encoding="utf8")["compadre"]
print(type(c), list(c.keys()) if isinstance(c,dict) else '')
for k,v in c.items():
    print("==",k,type(v), getattr(v,'shape',None) or (len(v) if hasattr(v,'__len__') else ''))
md = c.get('metadata')
if md is not None:
    print(list(md.columns)); print(md.head(3).T.head(60))
m = c.get('mat')
print(type(m), len(m)); print(type(m[0]), m[0] if not hasattr(m[0],'keys') else {k:type(x) for k,x in m[0].items()})
pickle.dump(c, open("data/raw/compadre/_parsed.pkl","wb"))
