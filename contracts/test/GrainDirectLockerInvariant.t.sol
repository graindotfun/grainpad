// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.28;
import {GrainMainnetDexLocker} from '../src/mainnet/v3/GrainMainnetDexLocker.sol';
import {IV3Npm} from '../src/mainnet/v3/IUniswapV3Min.sol';
contract FeeAsset {
 mapping(address=>uint256)public balanceOf;
 function mint(address a,uint256 n)external{balanceOf[a]+=n;}
 function transfer(address a,uint256 n)external returns(bool){require(balanceOf[msg.sender]>=n);balanceOf[msg.sender]-=n;balanceOf[a]+=n;return true;}
}
contract DirectPositionFixture {
 address public owner;address public token0;address public token1;uint256 public next0;uint256 public next1;
 constructor(address a,address b){token0=a;token1=b;}
 function setOwner(address a)external{require(owner==address(0));owner=a;}
 function ownerOf(uint256)external view returns(address){return owner;}
 function positions(uint256)external view returns(uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128){return(0,address(0),token0,token1,10000,-200,200,123456,0,0,0,0);}
 function accrue(uint256 a,uint256 b)external{next0+=a;next1+=b;}
 function collect(IV3Npm.CollectParams calldata p)external returns(uint256 a,uint256 b){require(msg.sender==owner);a=next0;b=next1;next0=0;next1=0;FeeAsset(token0).mint(p.recipient,a);FeeAsset(token1).mint(p.recipient,b);}
}
contract DirectFeeHandler {
 FeeAsset public a;FeeAsset public b;DirectPositionFixture public npm;GrainMainnetDexLocker public locker;
 uint256 public gotA;uint256 public gotB;uint256 public claimedA;uint256 public claimedB;uint256 public donatedA;uint256 public donatedB;
 constructor(){a=new FeeAsset();b=new FeeAsset();npm=new DirectPositionFixture(address(a),address(b));locker=new GrainMainnetDexLocker(address(this),address(this),address(this),address(a),address(b),address(1),address(npm),true,-200,200);npm.setOwner(address(locker));locker.register(1);}
 function collect(uint96 x,uint96 y)external{uint256 u=uint256(x)%1e24;uint256 v=uint256(y)%1e24;npm.accrue(u,v);locker.collect();gotA+=u;gotB+=v;}
 function donate(uint96 x,uint96 y)external{uint256 u=uint256(x)%1e24;uint256 v=uint256(y)%1e24;a.mint(address(locker),u);b.mint(address(locker),v);donatedA+=u;donatedB+=v;}
 function claim(bool assetB,bool creatorBucket)external{address asset=assetB?address(b):address(a);uint256 n=creatorBucket?locker.creatorOwed(asset):locker.platformOwed(asset);if(n==0)return;locker.claim(asset,creatorBucket);if(assetB)claimedB+=n;else claimedA+=n;}
}
contract GrainDirectLockerInvariantTest {
 DirectFeeHandler public h;address[]private targets;
 function setUp()public{h=new DirectFeeHandler();targets.push(address(h));}
 function targetContracts()external view returns(address[]memory){return targets;}
 function invariantFeesRemainFullyBackedAndDonationsExcluded()public view{
  GrainMainnetDexLocker l=h.locker();address a=address(h.a());address b=address(h.b());
  uint256 owedA=l.creatorOwed(a)+l.platformOwed(a);uint256 owedB=l.creatorOwed(b)+l.platformOwed(b);
  require(owedA+h.claimedA()==h.gotA(),'conservation A');require(owedB+h.claimedB()==h.gotB(),'conservation B');
  require(h.a().balanceOf(address(l))==owedA+h.donatedA(),'backing A');require(h.b().balanceOf(address(l))==owedB+h.donatedB(),'backing B');
  require(h.npm().ownerOf(1)==address(l)&&l.registered()&&l.tokenId()==1,'custody');
 }
 function testFuzzSplitAndUnauthorizedClaim(uint128 amount)public{
  h.collect(uint96(uint256(amount)%type(uint96).max),0);GrainMainnetDexLocker l=h.locker();address a=address(h.a());uint256 collected=h.gotA();require(l.platformOwed(a)==collected*35/100&&l.creatorOwed(a)==collected-collected*35/100,'split');
  (bool ok,)=address(l).call(abi.encodeWithSignature('claim(address,bool)',a,true));require(!ok,'unauthorized claim');
 }
}
