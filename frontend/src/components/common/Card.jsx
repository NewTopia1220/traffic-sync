export default function Card({ title, badge, badgeColor="#3b82f6", children, style={} }) {
  return (
    <div style={{background:"rgba(14,20,36,0.9)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,...style}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:15,fontWeight:700,color:"#e2e8f0"}}>{title}</div>
        {badge&&<span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:badgeColor+"22",color:badgeColor,border:`1px solid ${badgeColor}44`,fontWeight:600}}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}
